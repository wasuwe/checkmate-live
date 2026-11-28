import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Chessboard } from 'react-chessboard'
import { boardOf, FX_LEVEL, fxEventFor, squarePosition, useFxPrefs, type FxEvent } from '../lib/fx'
import { checkWords, gameOf } from '../lib/games'
import {
  boardPosition,
  chainSquare,
  checkSquareFor,
  needsPromotion,
  pieceColor,
  previewFor,
  reachOf,
  type PieceReach,
} from '../lib/moves'
import { halfOf, isDarkSquare, piecesFor, sideSets, squareStyle, useSetPrefs, type Kind } from '../lib/pieceSets'
import { RULES } from '../lib/rules'
import { placeTag } from '../lib/pieceTag'
import { colorName } from '../lib/text'
import { useStylePrefs } from '../lib/pieceStyles'
import type { GameId, Promo, StateMsg } from '../lib/protocol'
import { FxBurst } from './Fx'
import { PromotionDialog } from './PromotionDialog'

interface Props {
  state: StateMsg
  /** ส่งตาเดินได้หรือไม่ในตอนนี้ (เชื่อมต่ออยู่) */
  online: boolean
  /** เพิ่มขึ้นทุกครั้งที่เซิร์ฟเวอร์ปฏิเสธตาเดิน ใช้ยกเลิกการแสดงผลล่วงหน้า */
  errorSeq: number
  /** เปลี่ยนทุกครั้งที่การเชื่อมต่อขาด ตาเดินที่ยังรอคำตอบจาก socket เดิมถือว่าไม่ถึงเซิร์ฟเวอร์ */
  session: number
  sendMove: (from: string, to: string, promo: Promo) => boolean
}

/** ตาเดินที่ส่งไปแล้วและกำลังรอเซิร์ฟเวอร์ยืนยัน */
interface Pending {
  fen: string
  from: string
  to: string
  ply: number
  errorSeq: number
  session: number
}

// ---------- ไฮไลต์ช่อง: กรอบภาพปิดทองของหนังสือนิทาน ----------
// ไฮไลต์ทุกแบบเป็น "กรอบ" ที่วางทับบนช่อง กลางช่องโปร่ง สีและลายของชุดกระดานจึงยังเห็นครบ
// (เจ้าของโปรเจกต์กำหนด 2026-11-28: ไฮไลต์แบบถมทั้งช่องทำให้กระดานเสียกิมมิค คือลายและสีของแต่ละชุดหายไป
// และไฮไลต์ต้องสวย ขี้เล่น เด่น และเข้ากับธีม) ไม่ใช้จุดและไม่ใช้ลูกศร (กำหนด 2026-11-27: ไม่เข้าธีม)
// ทอง = เดินไปได้ / หมากที่เลือก / ตาที่เพิ่งเดิน, แดง = คิงที่ถูก Check และทุกอย่างที่เป็นการกิน

/** ไฮไลต์หนึ่งแบบ: ภาพที่วางทับพื้นของช่อง และแสงที่เต้นเบา ๆ (ถ้ามี) */
interface Highlight {
  overlay: string
  /** สีของแสงที่เต้นที่ขอบในของช่อง (keyframes `sq-pulse` ใน index.css) ไม่ใส่ = ไม่เต้น */
  pulse?: string
}

type Shade = 'light' | 'dark'

interface Tone {
  /** สีกรอบ */
  edge: string
  /** เส้นแสงบาง ๆ กลางกรอบ ให้ดูเป็นกรอบปิดทอง */
  sheen: string
  /** แสงเรืองด้านในกรอบ */
  glow: string
}

const GOLD = '#C9973A'
const RED = '#C8352B'
// แสงเรืองมีสองสี: บนช่องอ่อนเป็นทองอ่อน บนช่องเข้มเป็นขาวนวล (ช่องเข้มจึงสว่างขึ้นเป็นสีพาสเทลของชุดนั้น ไม่กลายเป็นสีเทา)
const TONES = {
  gold: { light: { edge: GOLD, sheen: '#FFF3C4', glow: '#FFE9A6' }, dark: { edge: GOLD, sheen: '#FFF3C4', glow: '#FFFBEA' } },
  red: { light: { edge: RED, sheen: '#FFD9CF', glow: '#FF9C8A' }, dark: { edge: RED, sheen: '#FFD9CF', glow: '#FFC9BD' } },
} satisfies Record<string, Record<Shade, Tone>>
type ToneName = keyof typeof TONES

const svgUrl = (body: string): string =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>${body}</svg>`)}")`

/** ประกายสี่แฉกที่มุมกรอบ */
const sparkle = (cx: number, cy: number, s: number, tone: Tone): string =>
  `<path d='M${cx} ${cy - s}Q${cx} ${cy} ${cx + s} ${cy}Q${cx} ${cy} ${cx} ${cy + s}Q${cx} ${cy} ${cx - s} ${cy}Q${cx} ${cy} ${cx} ${cy - s}Z' fill='#FFFBEA' stroke='${tone.edge}' stroke-width='1.3' stroke-linejoin='round'/>`

interface FrameOptions {
  /** ความหนาของกรอบ (หน่วย: 1/100 ของช่อง) */
  width: number
  /** ความเข้มของแสงเรืองด้านในกรอบ 0–1 */
  glow: number
  /** ประกายที่มุม */
  sparkles?: boolean
  /** กรอบเส้นประแบบรอยเย็บ (ตาที่เพิ่งเดิน) */
  stitched?: boolean
  /** ความเข้มทั้งภาพ 0–1 (แบบชี้จางกว่าแบบเลือก) */
  opacity?: number
}

function frame(tone: Tone, { width, glow, sparkles = false, stitched = false, opacity = 1 }: FrameOptions): string {
  const box = `x='5' y='5' width='90' height='90' rx='10' fill='none'`
  return svgUrl(
    `<defs><filter id='b' x='-20%' y='-20%' width='140%' height='140%'><feGaussianBlur stdDeviation='5'/></filter></defs>` +
      `<g opacity='${opacity}'>` +
      `<rect ${box} stroke='${tone.glow}' stroke-width='15' opacity='${glow}' filter='url(#b)'/>` +
      `<rect ${box} stroke='${tone.edge}' stroke-width='${width}'${stitched ? ` stroke-dasharray='8 6.4' stroke-linecap='round'` : ''}/>` +
      (stitched ? '' : `<rect ${box} stroke='${tone.sheen}' stroke-width='${(width * 0.26).toFixed(2)}' opacity='0.95'/>`) +
      (sparkles ? sparkle(16, 16, 12, tone) + sparkle(86, 85, 7.5, tone) : '') +
      `</g>`,
  )
}

/** ไฮไลต์หนึ่งแบบ สำหรับช่องอ่อนและช่องเข้ม */
type Mark = Record<Shade, Highlight>
const both = (make: (shade: Shade) => Highlight): Mark => ({ light: make('light'), dark: make('dark') })
/** แสงเรืองใต้ตัวหมาก (หมากที่เลือก) */
const HALO: Record<Shade, string> = { light: '255, 236, 170', dark: '255, 252, 235' }
const PULSE: Record<ToneName, Record<Shade, string>> = {
  gold: { light: 'rgba(255, 226, 140, 0.95)', dark: 'rgba(255, 250, 228, 0.95)' },
  red: { light: 'rgba(232, 84, 66, 0.9)', dark: 'rgba(255, 190, 178, 0.95)' },
}

// ตาที่เพิ่งเดิน: กรอบทองเส้นประแบบรอยเย็บ เบากว่าแบบอื่น
const LAST_MOVE = both((shade) => ({ overlay: frame(TONES.gold[shade], { width: 4, glow: 0.55, stitched: true }) }))
// หมากที่เลือก: กรอบทองหนา แสงเรืองใต้ตัวหมาก
const SELECTED = both((shade) => ({
  overlay: `${frame(TONES.gold[shade], { width: 7, glow: 1 })}, radial-gradient(circle at 50% 58%, rgba(${HALO[shade]}, 0.85) 0%, rgba(${HALO[shade]}, 0.4) 45%, rgba(${HALO[shade]}, 0) 72%)`,
}))
// คิงหรือขุนที่ถูก Check: กรอบแดง แสงแดงใต้ตัวหมาก ขอบช่องยังเห็นพื้นเดิม
const CHECK = both((shade) => ({
  overlay: `${frame(TONES.red[shade], { width: 6.5, glow: 1 })}, radial-gradient(circle, rgba(200, 40, 32, 0.9) 0%, rgba(200, 40, 32, 0.5) 46%, rgba(200, 40, 32, 0) 76%)`,
  pulse: 'rgba(200, 53, 43, 0.85)',
}))
// ช่องที่เดินไปได้ (ทอง) และการกิน (แดง: ช่องที่เดินไปกิน และหมากที่จะถูกกิน) กรอบมีประกายที่มุมและแสงเต้นเบา ๆ
// แบบ HOVER ใช้ตอนชี้ที่หมากโดยยังไม่ได้เลือก: จางกว่า ไม่มีประกาย ไม่เต้น
const MOVE = both((shade) => ({ overlay: frame(TONES.gold[shade], { width: 6, glow: 1, sparkles: true }), pulse: PULSE.gold[shade] }))
const MOVE_HOVER = both((shade) => ({ overlay: frame(TONES.gold[shade], { width: 4.5, glow: 0.7, opacity: 0.8 }) }))
const CAPTURE = both((shade) => ({ overlay: frame(TONES.red[shade], { width: 6.5, glow: 1, sparkles: true }), pulse: PULSE.red[shade] }))
const CAPTURE_HOVER = both((shade) => ({ overlay: frame(TONES.red[shade], { width: 4.5, glow: 0.75, opacity: 0.85 }) }))

/** วางไฮไลต์ทับพื้นของช่อง: ลายและสีเดิมของช่องยังอยู่ข้างใต้ ไฮไลต์ที่วางทีหลังอยู่บนสุด */
function withHighlight(base: CSSProperties | undefined, h: Highlight): CSSProperties {
  const under = base?.backgroundImage
  const style: CSSProperties & { '--sq-glow'?: string } = {
    ...base,
    backgroundImage: under ? `${h.overlay}, ${under}` : h.overlay,
    backgroundSize: '100% 100%',
    backgroundRepeat: 'no-repeat',
  }
  if (h.pulse) {
    style['--sq-glow'] = h.pulse
    style.animation = 'sq-pulse 1.7s ease-in-out infinite'
  }
  return style
}
const NO_REACH: PieceReach = { targets: [], captures: [], victims: [] }

export function GameBoard({ state, online, errorSeq, session, sendMove }: Props) {
  const { set } = useSetPrefs()
  // กระดานแบ่งครึ่ง: ครึ่งของฝั่งไหนและตัวหมากของฝั่งนั้นใช้ชุดที่ผู้เล่นฝั่งนั้นเลือกไว้ในห้องรอ
  const whiteSet = sideSets(set, state.players).w
  const blackSet = sideSets(set, state.players).b
  const sets = useMemo(() => ({ w: whiteSet, b: blackSet }), [whiteSet, blackSet])
  const styles = useStylePrefs()
  // ช่องที่เมาส์ชี้อยู่ (บนจอสัมผัสคือช่องที่แตะล่าสุด)
  const [hover, setHover] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [selected, setSelected] = useState<{ square: string; ply: number } | null>(null)
  const [promotion, setPromotion] = useState<{ from: string; to: string; ply: number } | null>(null)

  // ค่าที่ผูกกับ ply เก่า ถูกเซิร์ฟเวอร์ปฏิเสธ หรือส่งบนการเชื่อมต่อที่ขาดไปแล้ว ถือว่าหมดอายุ ไม่ต้องล้างด้วย effect
  // (กรณีหลัง: ถ้าไม่ทิ้ง หน้าจอจะค้างแสดงว่าเดินแล้วตลอดไป ขณะที่เซิร์ฟเวอร์ยังรอตาเดินนั้นอยู่)
  const activePending =
    pending && pending.ply === state.ply && pending.errorSeq === errorSeq && pending.session === session ? pending : null
  const pickedSquare = selected && selected.ply === state.ply ? selected.square : null
  const activePromotion = promotion && promotion.ply === state.ply ? promotion : null

  const myColor = state.you.color
  const flipped = myColor === 'b'
  const canMove =
    online &&
    state.status === 'playing' &&
    myColor !== '' &&
    myColor === state.turn &&
    activePending === null

  const fen = activePending?.fen ?? state.fen
  const lastMove = activePending ?? state.lastMove ?? null
  const game = gameOf(state)
  // หมากฮอสระหว่างกินหลายต่อ: เลือกหมากที่ต้องกินต่อให้เอง
  const activeSelected = pickedSquare ?? (canMove ? chainSquare(state) : null)
  const picked = useMemo(
    () => (canMove && activeSelected ? reachOf(state, activeSelected) : NO_REACH),
    [canMove, activeSelected, state],
  )
  const targets = picked.targets
  // ชี้ที่หมากตัวไหนก็ได้ (ของเราหรือของคู่แข่ง): บอกชื่อหมาก และไฮไลต์ช่องที่มันเดินได้
  // ไม่แสดงระหว่างรอเซิร์ฟเวอร์ยืนยันตาเดิน เพราะกระดานที่เห็นยังไม่ใช่ตำแหน่งที่คำนวณได้
  const hoverPiece = hover ? (boardOf(fen).get(hover) ?? null) : null
  const hovered = useMemo(
    () => (hover && hoverPiece && !activePending ? reachOf(state, hover) : NO_REACH),
    [hover, hoverPiece, activePending, state],
  )
  const fx = useBoardFx(state)

  // หมากที่เพิ่งเดินเด้งลงช่องหนึ่งครั้งต่อตาเดิน
  const landOn = lastMove?.to
  const landKey = state.ply + (activePending ? 1 : 0)
  const pieces = useMemo(
    () => piecesFor(set, { landOn, landKey, styles, bySide: sets }),
    [set, sets, landOn, landKey, styles],
  )

  function commit(from: string, to: string, promo: Promo): boolean {
    const next = previewFor(state, from, to, promo)
    if (next === null) return false
    if (!sendMove(from, to, promo)) return false
    setPending({ fen: next, from, to, ply: state.ply, errorSeq, session })
    setSelected(null)
    return true
  }

  function tryMove(from: string, to: string): boolean {
    if (!canMove) return false
    if (needsPromotion(state, from, to)) {
      setPromotion({ from, to, ply: state.ply })
      setSelected(null)
      return false // หมากกลับที่เดิมก่อน รอผู้เล่นเลือกตัวที่จะเลื่อนขั้น
    }
    return commit(from, to, '')
  }

  function onSquareClick(square: string, piece: string | null) {
    if (!canMove) return
    if (activeSelected && targets.includes(square)) {
      tryMove(activeSelected, square)
      return
    }
    if (piece && pieceColor(piece) === myColor && square !== activeSelected) {
      setSelected({ square, ply: state.ply })
    } else {
      setSelected(null)
    }
  }

  // พื้นของทุกช่อง: ครึ่งกระดานของฝั่งไหนใช้สีและลายของชุดฝั่งนั้น แล้วไฮไลต์วางทับ
  const baseStyles = useMemo(() => halfBoardStyles(sets), [sets])
  const squareStyles: Record<string, CSSProperties> = { ...baseStyles }
  const mark = (sq: string, m: Mark) => {
    squareStyles[sq] = withHighlight(squareStyles[sq], m[isDarkSquare(sq) ? 'dark' : 'light'])
  }
  if (lastMove) {
    mark(lastMove.from, LAST_MOVE)
    mark(lastMove.to, LAST_MOVE)
  }
  const checked = checkSquareFor(state, fen)
  const position = useMemo(() => boardPosition(game, fen), [game, fen])
  if (checked) mark(checked, CHECK)
  if (activeSelected) mark(activeSelected, SELECTED)
  // ชี้ที่หมาก (จางกว่า) แล้วจึงวางของหมากที่เลือกอยู่ทับ
  for (const sq of hovered.targets) mark(sq, hovered.captures.includes(sq) ? CAPTURE_HOVER : MOVE_HOVER)
  for (const sq of hovered.victims) mark(sq, CAPTURE_HOVER)
  for (const sq of targets) mark(sq, picked.captures.includes(sq) ? CAPTURE : MOVE)
  // หมากที่จะถูกกินแม้ไม่ได้อยู่ที่ช่องปลายทาง (กินผ่าน กินข้าม หนีบ)
  for (const sq of picked.victims) mark(sq, CAPTURE)
  // ป้ายคำอธิบายของหมากที่ชี้: วางข้างตัวหมาก เลือกด้านที่ทับช่องที่ไฮไลต์อยู่น้อยที่สุด
  const tip = hover && hoverPiece ? pieceTip(game, hoverPiece) : null
  const tipPlace =
    tip && hover
      ? placeTag(hover, flipped, new Set([...hovered.targets, ...hovered.victims, ...targets, ...picked.victims]), new Set(boardOf(fen).keys()))
      : null
  const bottomSet = sets[flipped ? 'b' : 'w']

  return (
    <div className="board">
      <div className="board-clip">
        <Chessboard
          options={{
            id: 'game',
            position,
            pieces,
            boardOrientation: flipped ? 'black' : 'white',
            allowDragging: canMove,
            allowDrawingArrows: false,
            animationDurationInMs: 150,
            squareStyles,
            darkSquareStyle: squareStyle(bottomSet, true),
            lightSquareStyle: squareStyle(bottomSet, false),
            darkSquareNotationStyle: { color: bottomSet.light, fontWeight: 700 },
            lightSquareNotationStyle: { color: bottomSet.dark, fontWeight: 700 },
            onMouseOverSquare: ({ square }) => setHover(square),
            onMouseOutSquare: ({ square }) => setHover((h) => (h === square ? null : h)),
            canDragPiece: ({ piece }) => canMove && pieceColor(piece.pieceType) === myColor,
            onPieceDrop: ({ sourceSquare, targetSquare }) =>
              targetSquare !== null && tryMove(sourceSquare, targetSquare),
            onSquareClick: ({ square, piece }) => onSquareClick(square, piece?.pieceType ?? null),
          }}
        />
      </div>

      {/* ป้ายชื่อและวิธีเดินของหมากที่ชี้ วางข้างตัวหมาก มีปลายชี้ไปที่หมากตัวนั้น */}
      {tip && tipPlace && (
        <>
          <span className={`piece-tag-tail ${tipPlace.side}`} style={tipPlace.tail} aria-hidden="true" />
          <div className={`piece-tag ${tipPlace.side}`} style={tipPlace.tag} role="tooltip">
            <b>{tip.name}</b>
            {tip.desc && <span>{tip.desc}</span>}
          </div>
        </>
      )}

      {fx && <BoardFx key={fx.seq} event={fx.event} flipped={flipped} game={game} />}

      {activePromotion && myColor !== '' && (
        <PromotionDialog
          color={myColor}
          set={sets[myColor]}
          styles={styles}
          onPick={(promo) => {
            commit(activePromotion.from, activePromotion.to, promo)
            setPromotion(null)
          }}
          onCancel={() => setPromotion(null)}
        />
      )}
    </div>
  )
}

const ALL_SQUARES = Array.from({ length: 64 }, (_, i) => String.fromCharCode(97 + (i % 8)) + (1 + (i >> 3)))

/** สีและลายของทุกช่อง: แถว 1–4 ใช้ชุดของฝั่งขาว แถว 5–8 ใช้ชุดของฝั่งดำ */
function halfBoardStyles(sets: Record<'w' | 'b', BoardSetLike>): Record<string, CSSProperties> {
  const out: Record<string, CSSProperties> = {}
  for (const sq of ALL_SQUARES) out[sq] = squareStyle(sets[halfOf(sq)], isDarkSquare(sq))
  return out
}

type BoardSetLike = Parameters<typeof squareStyle>[0]

/** ชื่อของหมาก (พร้อมฝั่ง) และวิธีเดินสั้น ๆ จากหน้ากฎของเกมนั้น */
function pieceTip(game: GameId, piece: string): { name: string; desc: string } {
  const kind = piece.toUpperCase() as Kind
  const side = colorName(piece === kind ? 'w' : 'b')
  const info = RULES[game].pieces.find((p) => p.kind === kind)
  return { name: `${info?.name ?? 'หมาก'} (${side})`, desc: info?.desc ?? '' }
}

/** เหตุการณ์ล่าสุดที่ต้องเล่นเอฟเฟกต์ (กิน รุก รุกฆาต) หายเองเมื่อเล่นจบ */
function useBoardFx(state: StateMsg): { event: FxEvent; seq: number } | null {
  const prev = useRef<StateMsg | null>(null)
  const [fx, setFx] = useState<{ event: FxEvent; seq: number } | null>(null)

  useEffect(() => {
    const before = prev.current
    prev.current = state
    const event = fxEventFor(before, state, state.status === 'playing' ? checkSquareFor(state, state.fen) : null)
    if (!event) return
    const seq = state.ply
    setFx({ event, seq })
    const timer = setTimeout(() => setFx((f) => (f?.seq === seq ? null : f)), FX_LEVEL[event.kind].ms)
    return () => clearTimeout(timer)
  }, [state])

  return fx
}

function BoardFx({ event, flipped, game }: { event: FxEvent; flipped: boolean; game: GameId }) {
  const prefs = useFxPrefs()
  const type = prefs[event.kind]
  const seed = (event.square ? event.square.charCodeAt(0) * 8 + event.square.charCodeAt(1) : 7) + event.kind.length
  const words = checkWords(game)
  const banner = event.kind === 'mate' ? words.mate : event.kind === 'check' ? words.check : undefined

  const level = FX_LEVEL[event.kind].level

  return (
    <div className={`fx-layer lv${level}`} aria-hidden="true">
      {/* แสงวาบทั้งกระดาน (แรงขึ้นตามขั้น) ขั้น 3: แสงหมุนด้านหลัง */}
      <div className="fx-flash" />
      {level === 3 && <div className="fx-rays" />}
      {/* เอฟเฟกต์เกิดที่ตัวของฝ่ายตรงข้าม: ทุกตัวที่ถูกกิน คิงที่ถูกรุก หรือคิงที่ถูกรุกจน */}
      {level < 3 &&
        (event.squares ?? (event.square ? [event.square] : [])).map((sq, i) => (
          <div key={sq} className="fx-square" style={toPercent(squarePosition(sq, flipped))}>
            {/* แรงกระแทกที่ตัวที่โดน: วงแสงขยายออก เล่นทุกครั้งไม่ว่าเลือกเอฟเฟกต์แบบไหน */}
            <span className="fx-impact" />
            <FxBurst type={type} seed={seed + i * 17} dist={level === 1 ? 120 : 150} level={level} />
          </div>
        ))}
      {level === 3 && (
        <>
          {event.square ? (
            <div className="fx-square" style={toPercent(squarePosition(event.square, flipped))}>
              <span className="fx-impact" />
              <FxBurst type={type} seed={seed} dist={190} level={3} />
            </div>
          ) : (
            <FxBurst type={type} seed={seed} dist={190} level={3} />
          )}
          {/* พลุแปดลูกไล่กันรอบกระดาน */}
          {FIREWORKS.map((f, i) => (
            <div key={i} className="fx-square" style={{ left: `${f.left}%`, top: `${f.top}%` }}>
              <FxBurst type={type} seed={seed + (i + 1) * 31} dist={120} level={1} delay={f.at} />
            </div>
          ))}
        </>
      )}
      {banner && (
        <FxBurst
          type="none"
          seed={0}
          dist={0}
          level={level}
          banner={banner}
          bannerSize={level === 3 ? 'min(84px, 15cqw)' : 'min(60px, 13cqw)'}
          bannerSeconds={level === 3 ? 3.6 : 1.9}
        />
      )}
    </div>
  )
}

/** ตำแหน่ง (มุมซ้ายบนของกล่องขนาดหนึ่งช่อง เป็นเปอร์เซ็นต์ของกระดาน) และเวลาเริ่มของพลุตอนชนะ */
const FIREWORKS = [
  { left: 12.5, top: 12.5, at: 0.8 },
  { left: 75, top: 18, at: 1.1 },
  { left: 18, top: 68, at: 1.4 },
  { left: 72, top: 70, at: 1.7 },
  { left: 44, top: 6, at: 2.0 },
  { left: 4, top: 40, at: 2.3 },
  { left: 84, top: 44, at: 2.6 },
  { left: 44, top: 82, at: 2.9 },
]

function toPercent(pos: { left: number; top: number }): CSSProperties {
  return { left: `${pos.left}%`, top: `${pos.top}%` }
}
