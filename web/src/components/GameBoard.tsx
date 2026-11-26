import { useState, type CSSProperties } from 'react'
import { Chessboard } from 'react-chessboard'
import { usePieceSet } from '../lib/pieceSets'
import { applyMove, checkedKingSquare, isPromotion, legalTargets, pieceColor } from '../lib/moves'
import type { Promo, StateMsg } from '../lib/protocol'
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

const LAST_MOVE: CSSProperties = { background: 'var(--sq-last)' }
const SELECTED: CSSProperties = { background: 'var(--sq-selected)' }
const CHECK: CSSProperties = {
  background: 'radial-gradient(circle, var(--sq-check) 0%, transparent 75%)',
}
const TARGET: CSSProperties = {
  background: 'radial-gradient(circle, var(--sq-target) 22%, transparent 24%)',
}

export function GameBoard({ state, online, errorSeq, sendMove }: Props) {
  const pieceSet = usePieceSet()
  const [pending, setPending] = useState<Pending | null>(null)
  const [selected, setSelected] = useState<{ square: string; ply: number } | null>(null)
  const [promotion, setPromotion] = useState<{ from: string; to: string; ply: number } | null>(null)

  // ค่าที่ผูกกับ ply เก่าหรือถูกเซิร์ฟเวอร์ปฏิเสธแล้วถือว่าหมดอายุ ไม่ต้องล้างด้วย effect
  const activePending =
    pending && pending.ply === state.ply && pending.errorSeq === errorSeq ? pending : null
  const activeSelected = selected && selected.ply === state.ply ? selected.square : null
  const activePromotion = promotion && promotion.ply === state.ply ? promotion : null

  const myColor = state.you.color
  const canMove =
    online &&
    state.status === 'playing' &&
    myColor !== '' &&
    myColor === state.turn &&
    activePending === null

  const fen = activePending?.fen ?? state.fen
  const lastMove = activePending ?? state.lastMove ?? null
  const targets = canMove && activeSelected ? legalTargets(state.fen, activeSelected) : []

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

  const squareStyles: Record<string, CSSProperties> = {}
  if (lastMove) {
    squareStyles[lastMove.from] = LAST_MOVE
    squareStyles[lastMove.to] = LAST_MOVE
  }
  const checked = checkedKingSquare(fen)
  if (checked) squareStyles[checked] = CHECK
  if (activeSelected) squareStyles[activeSelected] = SELECTED
  for (const sq of targets) {
    squareStyles[sq] = { ...squareStyles[sq], ...TARGET }
  }

  return (
    <div className="board">
      <Chessboard
        options={{
          id: 'game',
          position: fen,
          pieces: pieceSet.pieces,
          boardOrientation: myColor === 'b' ? 'black' : 'white',
          allowDragging: canMove,
          allowDrawingArrows: false,
          animationDurationInMs: 150,
          squareStyles,
          darkSquareStyle: { backgroundColor: 'var(--sq-dark)' },
          lightSquareStyle: { backgroundColor: 'var(--sq-light)' },
          canDragPiece: ({ piece }) => canMove && pieceColor(piece.pieceType) === myColor,
          onPieceDrop: ({ sourceSquare, targetSquare }) =>
            targetSquare !== null && tryMove(sourceSquare, targetSquare),
          onSquareClick: ({ square, piece }) => onSquareClick(square, piece?.pieceType ?? null),
        }}
      />
      {activePromotion && myColor !== '' && (
        <PromotionDialog
          color={myColor}
          pieces={pieceSet.pieces}
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
