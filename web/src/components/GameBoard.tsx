import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Chessboard } from 'react-chessboard'
import { fxEventFor, squarePosition, useFxPrefs, type FxEvent } from '../lib/fx'
import { applyMove, checkedKingSquare, isPromotion, legalTargets, pieceColor } from '../lib/moves'
import { piecesFor, useSetPrefs } from '../lib/pieceSets'
import type { Promo, StateMsg } from '../lib/protocol'
import { FxBurst } from './Fx'
import { PromotionDialog } from './PromotionDialog'

interface Props {
  state: StateMsg
  /** ส่งตาเดินได้หรือไม่ในตอนนี้ (เชื่อมต่ออยู่) */
  online: boolean
  /** เพิ่มขึ้นทุกครั้งที่เซิร์ฟเวอร์ปฏิเสธตาเดิน ใช้ยกเลิกการแสดงผลล่วงหน้า */
  errorSeq: number
  sendMove: (from: string, to: string, promo: Promo) => boolean
}

/** ตาเดินที่ส่งไปแล้วและกำลังรอเซิร์ฟเวอร์ยืนยัน */
interface Pending {
  fen: string
  from: string
  to: string
  ply: number
  errorSeq: number
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

const FX_DURATION_MS = 1700

export function GameBoard({ state, online, errorSeq, sendMove }: Props) {
  const { set } = useSetPrefs()
  const [pending, setPending] = useState<Pending | null>(null)
  const [selected, setSelected] = useState<{ square: string; ply: number } | null>(null)
  const [promotion, setPromotion] = useState<{ from: string; to: string; ply: number } | null>(null)

  // ค่าที่ผูกกับ ply เก่าหรือถูกเซิร์ฟเวอร์ปฏิเสธแล้วถือว่าหมดอายุ ไม่ต้องล้างด้วย effect
  const activePending =
    pending && pending.ply === state.ply && pending.errorSeq === errorSeq ? pending : null
  const activeSelected = selected && selected.ply === state.ply ? selected.square : null
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
  const targets = canMove && activeSelected ? legalTargets(state.fen, activeSelected) : []
  const fx = useBoardFx(state)

  // หมากที่เพิ่งเดินเด้งลงช่องหนึ่งครั้งต่อตาเดิน
  const landOn = lastMove?.to
  const landKey = state.ply + (activePending ? 1 : 0)
  const pieces = useMemo(() => piecesFor(set, { landOn, landKey }), [set, landOn, landKey])

  function commit(from: string, to: string, promo: Promo): boolean {
    const next = applyMove(state.fen, from, to, promo)
    if (next === null) return false
    if (!sendMove(from, to, promo)) return false
    setPending({ fen: next, from, to, ply: state.ply, errorSeq })
    setSelected(null)
    return true
  }

  function tryMove(from: string, to: string): boolean {
    if (!canMove) return false
    if (isPromotion(state.fen, from, to)) {
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
  const checked = checkedKingSquare(fen)
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
            position: fen,
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

      {fx && <BoardFx key={fx.seq} event={fx.event} flipped={flipped} />}

      {activePromotion && myColor !== '' && (
        <PromotionDialog
          color={myColor}
          set={set}
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
    const event = fxEventFor(before, state, state.status === 'playing' ? checkedKingSquare(state.fen) : null)
    if (!event) return
    const seq = state.ply
    setFx({ event, seq })
    const timer = setTimeout(() => setFx((f) => (f?.seq === seq ? null : f)), FX_DURATION_MS)
    return () => clearTimeout(timer)
  }, [state])

  return fx
}

function BoardFx({ event, flipped }: { event: FxEvent; flipped: boolean }) {
  const prefs = useFxPrefs()
  const type = prefs[event.kind]
  const seed = (event.square ? event.square.charCodeAt(0) * 8 + event.square.charCodeAt(1) : 7) + event.kind.length
  const banner = event.kind === 'mate' ? 'รุกฆาต!' : event.kind === 'check' ? 'รุก!' : undefined

  return (
    <div className="fx-layer" aria-hidden="true">
      {event.square ? (
        <div className="fx-square" style={toPercent(squarePosition(event.square, flipped))}>
          <FxBurst type={type} seed={seed} dist={70} />
        </div>
      ) : (
        <FxBurst type={type} seed={seed} dist={180} />
      )}
      {banner && <FxBurst type="none" seed={0} dist={0} banner={banner} bannerSize={event.kind === 'mate' ? 64 : 54} />}
    </div>
  )
}

function toPercent(pos: { left: number; top: number }): CSSProperties {
  return { left: `${pos.left}%`, top: `${pos.top}%` }
}
