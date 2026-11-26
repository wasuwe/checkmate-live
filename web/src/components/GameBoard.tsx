import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Chessboard } from 'react-chessboard'
import { FX_LEVEL, fxEventFor, squarePosition, useFxPrefs, type FxEvent } from '../lib/fx'
import { checkWords, gameOf } from '../lib/games'
import {
  boardPosition,
  chainSquare,
  checkSquareFor,
  needsPromotion,
  pieceColor,
  previewFor,
  targetsFor,
} from '../lib/moves'
import { piecesFor, useSetPrefs } from '../lib/pieceSets'
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

const LAST_MOVE: CSSProperties = { backgroundColor: '#FFE27A' }
const SELECTED: CSSProperties = { backgroundColor: '#FFC23D' }
const CHECK: CSSProperties = {
  backgroundImage: 'radial-gradient(circle, rgba(194, 24, 91, 0.85) 0%, transparent 72%)',
}
// จุดสีชมพูขอบ Ink = ช่องว่างที่เดินไปได้, กรอบสีชมพู = ช่องที่กินได้
const DOT: CSSProperties = {
  backgroundImage: 'radial-gradient(circle, #FF5C8D 0 13%, #3B2F4A 14% 18%, transparent 19%)',
}
const RING: CSSProperties = { boxShadow: 'inset 0 0 0 0.75cqw #FF5C8D', borderRadius: '28%' }


export function GameBoard({ state, online, errorSeq, session, sendMove }: Props) {
  const { set } = useSetPrefs()
  const styles = useStylePrefs()
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
  const targets = canMove && activeSelected ? targetsFor(state, activeSelected) : []
  const fx = useBoardFx(state)

  // หมากที่เพิ่งเดินเด้งลงช่องหนึ่งครั้งต่อตาเดิน
  const landOn = lastMove?.to
  const landKey = state.ply + (activePending ? 1 : 0)
  const pieces = useMemo(() => piecesFor(set, { landOn, landKey, styles }), [set, landOn, landKey, styles])

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

  const occupied = useMemo(() => occupiedSquares(state.fen), [state.fen])
  const squareStyles: Record<string, CSSProperties> = {}
  if (lastMove) {
    squareStyles[lastMove.from] = LAST_MOVE
    squareStyles[lastMove.to] = LAST_MOVE
  }
  const checked = checkSquareFor(state, fen)
  const position = useMemo(() => boardPosition(game, fen), [game, fen])
  if (checked) squareStyles[checked] = { ...squareStyles[checked], ...CHECK }
  if (activeSelected) squareStyles[activeSelected] = SELECTED
  for (const sq of targets) {
    // ช่องปลายทางที่ไม่มีหมากแต่เป็นการกิน (กินผ่าน) ก็แสดงเป็นจุด ซึ่งพอสำหรับบอกว่าเดินไปได้
    squareStyles[sq] = { ...squareStyles[sq], ...(occupied.has(sq) ? RING : DOT) }
  }

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
            darkSquareStyle: { backgroundColor: set.dark },
            lightSquareStyle: { backgroundColor: set.light },
            darkSquareNotationStyle: { color: set.light, fontWeight: 700 },
            lightSquareNotationStyle: { color: set.dark, fontWeight: 700 },
            canDragPiece: ({ piece }) => canMove && pieceColor(piece.pieceType) === myColor,
            onPieceDrop: ({ sourceSquare, targetSquare }) =>
              targetSquare !== null && tryMove(sourceSquare, targetSquare),
            onSquareClick: ({ square, piece }) => onSquareClick(square, piece?.pieceType ?? null),
          }}
        />
      </div>

      {fx && <BoardFx key={fx.seq} event={fx.event} flipped={flipped} game={game} />}

      {activePromotion && myColor !== '' && (
        <PromotionDialog
          color={myColor}
          set={set}
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

/** ช่องที่มีหมากอยู่ อ่านจากส่วนตำแหน่งของ FEN */
function occupiedSquares(fen: string): Set<string> {
  const out = new Set<string>()
  const rows = fen.split(' ')[0].split('/')
  rows.forEach((row, r) => {
    let file = 0
    for (const ch of row) {
      if (ch >= '1' && ch <= '8') {
        file += Number(ch)
      } else {
        out.add(String.fromCharCode(97 + file) + (8 - r))
        file++
      }
    }
  })
  return out
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
