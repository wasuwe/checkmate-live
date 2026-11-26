import { PIECE_SETS, setPieceSet, usePieceSet } from '../lib/pieceSets'

const PREVIEW = ['wK', 'wN', 'bQ', 'bP']

/** ตัวเลือกชุดตัวหมาก มีผลกับหน้าจอของผู้เลือกเท่านั้น คู่แข่งเห็นชุดของตัวเอง */
export function PiecePicker() {
  const selected = usePieceSet()
  return (
    <fieldset className="piece-sets">
      <legend>ชุดตัวหมาก</legend>
      {PIECE_SETS.map((set) => (
        <label key={set.id} className={set.id === selected.id ? 'selected' : undefined}>
          <input
            type="radio"
            name="piece-set"
            value={set.id}
            checked={set.id === selected.id}
            onChange={() => setPieceSet(set.id)}
          />
          <span className="piece-preview" aria-hidden="true">
            {PREVIEW.map((piece) => (
              <span key={piece} className="piece-icon">
                {set.pieces[piece]()}
              </span>
            ))}
          </span>
          <span>{set.label}</span>
        </label>
      ))}
    </fieldset>
  )
}
