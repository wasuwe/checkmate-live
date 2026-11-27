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
import { colorName } from '../lib/text'
import { useStylePrefs } from '../lib/pieceStyles'
import type { GameId, Promo, StateMsg } from '../lib/protocol'
import { FxBurst } from './Fx'
import { PromotionDialog } from './PromotionDialog'

/** ชื่อและวิธีเดินของหมากที่ชี้อยู่ */
export interface PieceInfo {
  name: string
  desc: string
}

interface Props {
  state: StateMsg
  /** ส่งตาเดินได้หรือไม่ในตอนนี้ (เชื่อมต่ออยู่) */
  online: boolean
  /** เพิ่มขึ้นทุกครั้งที่เซิร์ฟเวอร์ปฏิเสธตาเดิน ใช้ยกเลิกการแสดงผลล่วงหน้า */
  errorSeq: number
  /** เปลี่ยนทุกครั้งที่การเชื่อมต่อขาด ตาเดินที่ยังรอคำตอบจาก socket เดิมถือว่าไม่ถึงเซิร์ฟเวอร์ */
  session: number
  sendMove: (from: string, to: string, promo: Promo) => boolean
  /** บอกหน้าที่ครอบอยู่ว่ากำลังชี้ที่หมากตัวไหน (null = ไม่ได้ชี้) ให้แสดงคำอธิบายนอกกระดานได้ */
  onPieceInfo?: (info: PieceInfo | null) => void
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

// สไตล์นิทาน: ตาที่เพิ่งเดินและหมากที่เลือกเป็นแสงทอง
// (backgroundImage: none เพื่อให้สีทองทับลายของช่องเหมือนกันทั้งสองครึ่งกระดาน)
const LAST_MOVE: CSSProperties = { backgroundColor: '#F3DC9C', backgroundImage: 'none' }
const SELECTED: CSSProperties = { backgroundColor: '#E9C46E', backgroundImage: 'none' }
// โทนแดง (เจ้าของโปรเจกต์กำหนด): คิงที่ถูก Check และทุกอย่างที่เป็นการกิน
const RED = '#C8352B'
const CHECK: CSSProperties = {
  backgroundImage:
    'radial-gradient(circle, rgba(200, 40, 32, 0.95) 0%, rgba(200, 40, 32, 0.6) 48%, rgba(200, 40, 32, 0.18) 80%)',
  boxShadow: `inset 0 0 0 0.6cqw ${RED}`,
}
// ช่องที่เดินไปได้ไฮไลต์ทั้งช่อง ไม่ใช้จุดและไม่ใช้ลูกศร (เจ้าของโปรเจกต์กำหนด 2026-11-27: จุดกับลูกศรไม่เข้าธีม)
// แสงทองกรอบทอง = เดินไปได้, แสงแดงกรอบแดง = เป็นการกิน (ช่องที่เดินไปกิน และหมากที่จะถูกกิน)
// แบบ HOVER จางกว่า ใช้ตอนชี้ที่หมากโดยยังไม่ได้เลือก
// สีพื้นเป็นทองอ่อนที่ทึบพอ ช่องจึงออกโทนอุ่นเหมือนกันทุกชุดกระดาน (ทองโปร่งบนช่องสีฟ้าหรือเขียวจะกลายเป็นสีเทาหม่น)
const fill = (rgb: string, alpha: number, edge: string, width: number): CSSProperties => ({
  backgroundImage: `linear-gradient(rgba(${rgb}, ${alpha}), rgba(${rgb}, ${alpha}))`,
  boxShadow: `inset 0 0 0 ${width}cqw ${edge}`,
})
const GLOW_RGB = '246, 226, 168'
const BLUSH_RGB = '236, 150, 132'
const MOVE = fill(GLOW_RGB, 0.9, 'rgba(201, 151, 58, 1)', 0.5)
const MOVE_HOVER = fill(GLOW_RGB, 0.62, 'rgba(201, 151, 58, 0.75)', 0.35)
const CAPTURE = fill(BLUSH_RGB, 0.88, `${RED}`, 0.6)
const CAPTURE_HOVER = fill(BLUSH_RGB, 0.6, 'rgba(200, 53, 43, 0.8)', 0.4)
const NO_REACH: PieceReach = { targets: [], captures: [], victims: [] }

export function GameBoard({ state, online, errorSeq, session, sendMove, onPieceInfo }: Props) {
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
  const mark = (sq: string, style: CSSProperties) => {
    squareStyles[sq] = { ...squareStyles[sq], ...style }
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
  const tipName = hover && hoverPiece ? pieceTip(game, hoverPiece).name : null
  const tipDesc = hover && hoverPiece ? pieceTip(game, hoverPiece).desc : ''
  // ส่งให้หน้าที่ครอบอยู่ทุกครั้งที่หมากที่ชี้เปลี่ยน (และล้างเมื่อกระดานถูกถอดออก)
  useEffect(() => {
    onPieceInfo?.(tipName === null ? null : { name: tipName, desc: tipDesc })
    // onPieceInfo เป็นตัวตั้งค่า state ของหน้าที่ครอบอยู่ ไม่ใช่เหตุให้ส่งซ้ำ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipName, tipDesc])
  useEffect(() => () => onPieceInfo?.(null), [])  // eslint-disable-line react-hooks/exhaustive-deps
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

      {/* ป้ายชื่อหมากเกาะขอบล่างของกระดาน ไม่ทับช่อง (จอกว้างซ่อนไว้ แล้วแสดงในแผงข้างพร้อมวิธีเดินแทน) */}
      {tipName !== null && (
        <div className="piece-tip" role="tooltip">
          <b>{tipName}</b>
          {tipDesc && <span>{tipDesc}</span>}
        </div>
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
