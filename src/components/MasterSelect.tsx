import { useState } from 'react'
import { sortMasters, MASTER_TYPE_PLURAL } from '@/lib/masters'
import { MasterFormSheet, type MasterFormValues } from '@/features/masters/components/MasterFormSheet'
import { MASTER_TYPES } from '@/types'
import type { AppState, Master, MasterType } from '@/types'

/** Sentinel option value — mirrors CategorySelect's `__add__`. */
const ADD = '__add__'

interface Props {
  value: string
  onChange: (v: string) => void
  state: AppState
  onAddMaster: (form: MasterFormValues) => Promise<Master | undefined>
  style?: React.CSSProperties
  includeEmpty?: boolean
  emptyLabel?: string
}

/** Pick a person or merchant, or create one inline.
 *
 *  A native <select> with optgroups, modelled on CategorySelect: it is what every
 *  other picker in QuickAdd already is, mobile browsers render it as an OS picker,
 *  and it costs a fraction of a bespoke sheet. If a directory ever grows past a few
 *  dozen entries, a searchable variant is the follow-up — `searchMasters` exists. */
export function MasterSelect({
  value, onChange, state, onAddMaster, style, includeEmpty, emptyLabel = 'None',
}: Props) {
  const [showAdd, setShowAdd] = useState(false)

  const byType = (t: MasterType) => sortMasters(state.masters.filter(m => m.type === t))
  const people = byType(MASTER_TYPES.PERSON)
  const merchants = byType(MASTER_TYPES.MERCHANT)

  const handleChange = (v: string) => {
    if (v === ADD) { setShowAdd(true); return }
    onChange(v)
  }

  return (
    <>
      <select value={value} onChange={e => handleChange(e.target.value)} style={style}>
        {includeEmpty && <option value="">{emptyLabel}</option>}
        {people.length > 0 && (
          <optgroup label={MASTER_TYPE_PLURAL[MASTER_TYPES.PERSON]}>
            {people.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </optgroup>
        )}
        {merchants.length > 0 && (
          <optgroup label={MASTER_TYPE_PLURAL[MASTER_TYPES.MERCHANT]}>
            {merchants.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </optgroup>
        )}
        <option value={ADD}>+ Add master</option>
      </select>

      <MasterFormSheet
        open={showAdd}
        onClose={() => setShowAdd(false)}
        state={state}
        onSave={async form => {
          const created = await onAddMaster(form)
          // Select what was just created — the whole point of creating from here.
          if (created) onChange(created.id)
        }}
      />
    </>
  )
}
