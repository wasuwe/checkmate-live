package store

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/wasuwe/checkmate-live/server/internal/members"
)

// Members อ่านรายชื่อบัญชีและสถิติการเล่น ใช้เป็น members.Store
//
// รายชื่อบัญชีมาจากตารางของ Supabase Auth (auth.users) ซึ่งเซิร์ฟเวอร์อ่านอย่างเดียว ไม่เคยเขียน
// สถิติมาจากตาราง games ซึ่งมีหนึ่งแถวต่อเกมที่จบ ผู้เล่นรับเชิญเป็น NULL ในแถวเหล่านั้น
type Members struct {
	s *Store
	// users คือชื่อตารางบัญชี เป็นค่าคงที่ในโค้ด (test เปลี่ยนเป็นตารางจำลอง) ไม่เคยมาจากผู้ใช้
	users string
}

// Members คืนตัวอ่านข้อมูลสมาชิกที่ใช้การเชื่อมต่อเดียวกับ Store
func (s *Store) Members() *Members {
	return &Members{s: s, users: "auth.users"}
}

var _ members.Store = (*Members)(nil)

const (
	// maxMembers คือจำนวนบัญชีสูงสุดที่คืนในรายการเดียว (หน้าเว็บค้นและเรียงเอง)
	maxMembers = 5000
	// maxOpponents และ maxRecentGames จำกัดขนาดของหน้ารายละเอียด
	maxOpponents   = 50
	maxRecentGames = 100
)

// perPlayer แตกแต่ละเกมออกเป็นหนึ่งแถวต่อผู้เล่นที่มีบัญชี พร้อมผลจากมุมของคนนั้น
const perPlayer = `(
	select white_id as player, black_id as opponent, 'w' as color, variant, reason, time_control, started_at, ended_at,
	       case result when '1-0' then 'win' when '0-1' then 'loss' else 'draw' end as outcome
	from games where white_id is not null
	union all
	select black_id, white_id, 'b', variant, reason, time_control, started_at, ended_at,
	       case result when '0-1' then 'win' when '1-0' then 'loss' else 'draw' end
	from games where black_id is not null
)`

// seconds คือความยาวของเกมเป็นวินาที (ไม่ติดลบ แม้นาฬิกาของเครื่องจะเคยถูกปรับ)
const seconds = `greatest(0, extract(epoch from (x.ended_at - x.started_at)))`

// statCols คือคอลัมน์สถิติหกตัว ลำดับตรงกับ scanStats
const statCols = `count(*)::int,
	(count(*) filter (where x.outcome = 'win'))::int,
	(count(*) filter (where x.outcome = 'loss'))::int,
	(count(*) filter (where x.outcome = 'draw'))::int,
	coalesce(sum(` + seconds + `), 0)::bigint,
	max(x.ended_at)`

func statDest(s *members.Stats) []any {
	return []any{&s.Games, &s.Wins, &s.Losses, &s.Draws, &s.Seconds, &s.LastPlayed}
}

// memberQuery คืนคำสั่งอ่านบัญชีพร้อมสถิติรวม where คือเงื่อนไขเพิ่ม (ค่าคงที่ในโค้ด)
func (m *Members) memberQuery(where string) string {
	return fmt.Sprintf(`
		select u.id::text, coalesce(u.email, ''), coalesce(u.created_at, 'epoch'), u.last_sign_in_at,
		       coalesce(p.display_name, ''), coalesce(p.avatar_id, ''),
		       coalesce(g.games, 0), coalesce(g.wins, 0), coalesce(g.losses, 0), coalesce(g.draws, 0),
		       coalesce(g.seconds, 0), g.last_played
		from %s u
		left join profiles p on p.user_id = u.id
		left join (
			select x.player, %s
			from %s x group by x.player
		) g (player, games, wins, losses, draws, seconds, last_played) on g.player = u.id
		%s
		order by u.created_at desc nulls last, u.id
		limit %d`, m.users, statCols, perPlayer, where, maxMembers)
}

func scanMember(row pgx.CollectableRow) (members.Member, error) {
	var out members.Member
	dest := append([]any{&out.ID, &out.Email, &out.JoinedAt, &out.LastSignIn, &out.Name, &out.Avatar}, statDest(&out.Stats)...)
	return out, row.Scan(dest...)
}

func (m *Members) List(ctx context.Context) ([]members.Member, error) {
	rows, err := m.s.pool.Query(ctx, m.memberQuery(""))
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, scanMember)
}

func (m *Members) Get(ctx context.Context, userID string) (*members.Detail, error) {
	id := accountID(userID)
	if !id.Valid {
		return nil, members.ErrNotFound // ไม่ใช่ uuid = ไม่มีทางเป็นบัญชี
	}

	rows, err := m.s.pool.Query(ctx, m.memberQuery("where u.id = $1"), id)
	if err != nil {
		return nil, err
	}
	member, err := pgx.CollectExactlyOneRow(rows, scanMember)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, members.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	out := &members.Detail{Member: member}

	// แยกตามชนิดของเกม
	rows, err = m.s.pool.Query(ctx, `
		select x.variant, `+statCols+`
		from `+perPlayer+` x
		where x.player = $1
		group by x.variant
		order by count(*) desc, x.variant`, id)
	if err != nil {
		return nil, err
	}
	out.ByGame, err = pgx.CollectRows(rows, func(row pgx.CollectableRow) (members.GameStats, error) {
		var g members.GameStats
		return g, row.Scan(append([]any{&g.Game}, statDest(&g.Stats)...)...)
	})
	if err != nil {
		return nil, err
	}

	// แยกตามคู่แข่ง ผู้เล่นรับเชิญ (opponent เป็น NULL) รวมเป็นแถวเดียว
	rows, err = m.s.pool.Query(ctx, fmt.Sprintf(`
		select coalesce(x.opponent::text, ''), coalesce(p.display_name, ''), coalesce(p.avatar_id, ''), coalesce(u.email, ''), %s
		from %s x
		left join profiles p on p.user_id = x.opponent
		left join %s u on u.id = x.opponent
		where x.player = $1
		group by x.opponent, p.display_name, p.avatar_id, u.email
		order by count(*) desc, max(x.ended_at) desc
		limit %d`, statCols, perPlayer, m.users, maxOpponents), id)
	if err != nil {
		return nil, err
	}
	out.Opponents, err = pgx.CollectRows(rows, func(row pgx.CollectableRow) (members.Opponent, error) {
		var o members.Opponent
		return o, row.Scan(append([]any{&o.ID, &o.Name, &o.Avatar, &o.Email}, statDest(&o.Stats)...)...)
	})
	if err != nil {
		return nil, err
	}

	// เกมล่าสุด
	rows, err = m.s.pool.Query(ctx, fmt.Sprintf(`
		select x.variant, x.color, x.outcome, x.reason, x.time_control, x.started_at, (%s)::bigint,
		       coalesce(x.opponent::text, ''), coalesce(p.display_name, ''), coalesce(u.email, '')
		from %s x
		left join profiles p on p.user_id = x.opponent
		left join %s u on u.id = x.opponent
		where x.player = $1
		order by x.ended_at desc
		limit %d`, seconds, perPlayer, m.users, maxRecentGames), id)
	if err != nil {
		return nil, err
	}
	out.Recent, err = pgx.CollectRows(rows, func(row pgx.CollectableRow) (members.GameRow, error) {
		var g members.GameRow
		return g, row.Scan(&g.Game, &g.Color, &g.Outcome, &g.Reason, &g.TimeControl, &g.StartedAt, &g.Seconds,
			&g.OpponentID, &g.OpponentName, &g.OpponentEmail)
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}
