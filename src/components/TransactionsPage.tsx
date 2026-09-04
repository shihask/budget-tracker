import { useState, useMemo, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useTheme } from '@/lib/theme-context'
import { useAppDialog } from './AppDialog'
import { CAT_COLORS, ACCOUNT_PALETTE } from '@/lib/tokens'
import { fmt, fmtDate, fmtTime, round2, TimeoutError, openDatePicker, selectOnFocus } from '@/lib/utils'
import { catById as buildCatById } from '@/lib/data'
import { EventIcon } from '@/features/events/lib/eventIcons'
import { masterById, MASTER_ACCENTS } from '@/lib/masters'
import { MasterSelect } from './MasterSelect'
import type { MasterFormValues } from '@/features/masters/components/MasterFormSheet'
import { EventFormSheet, type EventFormValues } from '@/features/events/components/EventFormSheet'
import { evaluateAmountExpression, sanitizeAmountInput } from '@/lib/amountExpression'
import { CategorySelect } from './CategorySelect'
import { AmountOperatorRow } from './AmountOperatorRow'
import { BottomSheet, HelpText } from './BottomSheet'
import { ReceiptField } from './ReceiptField'
import { ExportTransactionsSheet } from './ExportTransactionsSheet'
import { Receipt } from 'lucide-react'
import { filterAndSortTransactions, type TxnSortKey } from '@/lib/transactionFilters'
import { groupSplitTransactions, splitGroupLegs, isSplitValid, type TransactionGroup } from '@/lib/splitGroups'
import { SplitLegsEditor } from './SplitLegsEditor'
import type { Master, AppState, Transaction, TransactionType, SplitLegInput, LifeEvent } from '@/types'
import { reimbursementsFor, reimbursementSummary, remainingReimbursable, reimbursedTotals } from '@/lib/reimbursements'
import { LinkReimbursementSheet } from './LinkReimbursementSheet'
import type { PickedReceipt } from '@/lib/imageCompress'

type EditForm = {
  description: string
  amount: string
  transaction_date: string
  transaction_type: TransactionType
  category_id: string
  from_account_id: string
  to_account_id: string
  event_id: string
  master_id: string
  /** '' = leave the link alone is NOT representable here; the sheet always knows
   *  the current value, so '' means unlinked and an id means linked. */
  reimbursement_for: string
}

type SavedFormSnapshot = {
  description: string
  amount: number
  transaction_date: string
  transaction_type: TransactionType
  category_id: string | null
  from_account_id: string | null
  to_account_id: string | null
  event_id: string | null
  master_id: string | null
  reimbursement_for: string | null
}

interface TransactionsPageProps {
  state: AppState
  onDelete: (t: Transaction) => Promise<void>
  onUpdate: (old: Transaction, form: Omit<Transaction, 'id' | 'created_at' | 'to_account_id' | 'notes'> & { to_account_id?: string | null }) => Promise<void>
  onClose: () => void
  onSwipeProgress?: (pct: number) => void
  dark: boolean
  onToggleTheme: () => void
  userName: string
  userEmail: string
  synced: boolean
  onSignOut: () => void
  onSettings: () => void
  onCategories: () => void
  onAddCategory: (name: string, group_name: string) => Promise<string>
  onAddMaster: (form: MasterFormValues) => Promise<Master | undefined>
  onAddEvent: (form: EventFormValues) => Promise<LifeEvent | undefined>
  onReversePayment: (t: Transaction) => Promise<void>
  onDeleteSavings?: (id: string) => Promise<void>
  initialEditTx?: Transaction | null
  onAdd?: () => void
  onToggleChallengeExclusion?: (txnId: string) => Promise<void>
  allTransactionsLoaded?: boolean
  loadingMore?: boolean
  onLoadMore?: () => void
  onUploadReceipt?: (transactionId: string, receipt: PickedReceipt) => Promise<void>
  onRemoveReceipt?: (t: Transaction) => Promise<void>
  getReceiptUrl?: (path: string) => Promise<string | null>
  userId: string
  /** Split payments are edited and deleted as a group — never one leg at a time. */
  onUpdateSplitGroup?: (
    splitGroupId: string,
    form: { transaction_date: string; description: string; amount: number; category_id: string | null },
    legs: SplitLegInput[],
    previousLegIds: string[],
  ) => Promise<Transaction[]>
  onDeleteSplitGroup?: (splitGroupId: string) => Promise<void>
  onDeleteSplitLeg?: (leg: Transaction) => Promise<void>
  /** Opens Quick Add prefilled to reimburse `expense` for `remaining` — the reverse
   *  entry point, from the expense you are already looking at. */
  onRecordReimbursement?: (expense: Transaction, remaining: number) => void
}

type SplitEditState = {
  groupId: string
  description: string
  amount: string
  transaction_date: string
  category_id: string
  legs: SplitLegInput[]
  originalLegIds: string[]
}

export function TransactionsPage({ state, onDelete, onUpdate, onClose, onSwipeProgress, dark, onToggleTheme, userName, userEmail, synced, onSignOut, onSettings, onCategories, onAddCategory, onAddMaster, onAddEvent, onReversePayment, onDeleteSavings, initialEditTx, onAdd, onToggleChallengeExclusion, allTransactionsLoaded, loadingMore, onLoadMore, onUploadReceipt, onRemoveReceipt, getReceiptUrl, userId, onUpdateSplitGroup, onDeleteSplitGroup, onDeleteSplitLeg, onRecordReimbursement }: TransactionsPageProps) {
  const c = useTheme()
  const { confirm, dialogNode } = useAppDialog()
  const catMap = buildCatById(state.categories)
  // Built once per render rather than re-scanning the ledger for every row.
  const rowRecovered = useMemo(() => reimbursedTotals(state.transactions), [state.transactions])

  useEffect(() => {
    if (initialEditTx) openEdit(initialEditTx)
  }, [])

  // Lock the page behind this full-screen overlay so the dashboard doesn't
  // show a second scrollbar / scroll underneath. Restore on close.
  useEffect(() => {
    const prevBody = document.body.style.overflow
    const prevHtml = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevBody
      document.documentElement.style.overflow = prevHtml
    }
  }, [])

  const [search, setSearch] = useState('')
  const [filterAccount, setFilterAccount] = useState('all')
  const [filterCategory, setFilterCategory] = useState('all')
  const [filterGroup, setFilterGroup] = useState('all')
  const [filterEvent, setFilterEvent] = useState('all')
  const [eventPickerOpen, setEventPickerOpen] = useState(false)
  // Optional-fields disclosure, mirroring QuickAdd's. Its own localStorage key:
  // these are different forms and a preference set while adding shouldn't
  // silently change how editing looks.
  const [showEditMore, setShowEditMore] = useState(() => {
    try { return localStorage.getItem('mp-edittx-more') === '1' } catch { return false }
  })
  const toggleEditMore = () => setShowEditMore(v => {
    const next = !v
    try { localStorage.setItem('mp-edittx-more', next ? '1' : '0') } catch { /* private mode */ }
    return next
  })
  const [eventFormOpen, setEventFormOpen] = useState(false)
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const dateToRef = useRef<HTMLInputElement>(null)
  const [sortKey, setSortKey] = useState<TxnSortKey>('date_desc')
  const [exportOpen, setExportOpen] = useState(false)
  const [showSystemTxns, setShowSystemTxns] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [editingTx, setEditingTx] = useState<Transaction | null>(null)
  const [editForm, setEditForm] = useState<EditForm | null>(null)
  const [pendingReceipt, setPendingReceipt] = useState<PickedReceipt | null>(null)
  const [removeReceiptFlag, setRemoveReceiptFlag] = useState(false)
  const [receiptError, setReceiptError] = useState<string | null>(null)
  const [lastSavedForm, setLastSavedForm] = useState<SavedFormSnapshot | null>(null)
  const [saving, setSaving] = useState(false)
  const [quickCatTx, setQuickCatTx] = useState<Transaction | null>(null)
  const [quickCatId, setQuickCatId] = useState('')
  const [quickCatSaving, setQuickCatSaving] = useState(false)
  const [filtersVisible, setFiltersVisible] = useState(false)
  const [dragX, setDragX] = useState(0)
  const [closing, setClosing] = useState(false)
  const [snapping, setSnapping] = useState(false)
  const [entryPlayed, setEntryPlayed] = useState(false)
  const dragXRef = useRef(0)
  const editAmountRef = useRef<HTMLInputElement | null>(null)
  const [editAmountFocused, setEditAmountFocused] = useState(false)
  // Mobile engines paint a scripted select() only briefly, then collapse it when the
  // keyboard animates in — so neither the highlight nor the replace-everything
  // behaviour can rest on the DOM selection. Both are owned here instead: the pill is
  // painted by the mirror below, and the first input is rewritten in `beforeinput`.
  const [editAmountSelectAll, setEditAmountSelectAll] = useState(false)
  const editAmountSelectAllRef = useRef(false)
  editAmountSelectAllRef.current = editAmountSelectAll
  const editSheetOpen = editForm !== null
  // Native listener, not React's onBeforeInput — that one is still a synthesized event
  // in React 19 and its preventDefault doesn't reliably stop the insertion.
  useEffect(() => {
    const el = editAmountRef.current
    if (!el) return
    const onBeforeInput = (ev: InputEvent) => {
      if (!editAmountSelectAllRef.current) return
      ev.preventDefault()
      setEditAmountSelectAll(false)
      const typed = ev.inputType === 'insertText' ? ev.data ?? ''
        : ev.inputType === 'insertFromPaste' ? ev.dataTransfer?.getData('text') ?? ''
        : ''  // a delete of the whole value is still an empty field
      setEditForm(f => f ? { ...f, amount: sanitizeAmountInput(typed) } : f)
    }
    el.addEventListener('beforeinput', onBeforeInput)
    return () => el.removeEventListener('beforeinput', onBeforeInput)
  }, [editSheetOpen])

  const gestureRef = useRef<{ startX: number; startY: number; lastX: number; lastT: number } | null>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const W = typeof window !== 'undefined' ? window.innerWidth : 400

  useEffect(() => {
    const t = setTimeout(() => setEntryPlayed(true), 360)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (!onLoadMore || allTransactionsLoaded) return
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting) onLoadMore()
    }, { rootMargin: '200px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [onLoadMore, allTransactionsLoaded])

  const triggerClose = () => {
    setClosing(true)
    onSwipeProgress?.(1)
    setTimeout(() => { onSwipeProgress?.(0); onClose() }, 290)
  }

  const onTouchStart = (e: React.TouchEvent) => {
    if (closing) return
    const t = e.touches[0]
    if (t.clientX > 28) return
    gestureRef.current = { startX: t.clientX, startY: t.clientY, lastX: t.clientX, lastT: Date.now() }
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (!gestureRef.current) return
    const t = e.touches[0]
    const dx = t.clientX - gestureRef.current.startX
    const dy = Math.abs(t.clientY - gestureRef.current.startY)
    if (dy > Math.abs(dx) + 5 && Math.abs(dx) < 15) {
      gestureRef.current = null; setDragX(0); onSwipeProgress?.(0); return
    }
    gestureRef.current = { ...gestureRef.current, lastX: t.clientX, lastT: Date.now() }
    const x = Math.max(0, dx)
    dragXRef.current = x
    setDragX(x)
    onSwipeProgress?.(x / W)
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!gestureRef.current) return
    const t = e.changedTouches[0]
    const dx = t.clientX - gestureRef.current.startX
    const dt = Date.now() - gestureRef.current.lastT
    const vx = dt > 0 ? (t.clientX - gestureRef.current.lastX) / dt : 0
    gestureRef.current = null
    if (dx > W * 0.38 || (dx > 50 && vx > 0.5)) {
      triggerClose()
    } else {
      setSnapping(true); setDragX(0); dragXRef.current = 0; onSwipeProgress?.(0)
      setTimeout(() => setSnapping(false), 300)
    }
  }
  const accounts = state.accounts.filter(a => a.is_active)
  const groups = state.groups

  const filtered = useMemo(() => filterAndSortTransactions(
    state.transactions,
    state.categories,
    { search, account: filterAccount, category: filterCategory, group: filterGroup, event: filterEvent, dateFrom: filterDateFrom, dateTo: filterDateTo, showSystemTxns },
    sortKey,
  ), [state.transactions, state.categories, search, filterAccount, filterCategory, filterGroup, filterEvent, filterDateFrom, filterDateTo, sortKey, showSystemTxns])

  // Sums the raw legs, not the group entries — correct as-is because it runs
  // before grouping, where a split is still N ordinary rows.
  const totalFiltered = filtered.reduce((s, t) => s + t.amount, 0)

  // Collapsing under an account filter would show a ₹30,000 card while filtered to an
  // account that only funded ₹10,000 of it, so the legs stay separate there instead.
  const collapseSplits = filterAccount === 'all'
  const txnGroups = useMemo(
    () => groupSplitTransactions(filtered, state.transactions, { collapse: collapseSplits }),
    [filtered, state.transactions, collapseSplits],
  )

  const [borrowingDeleteTarget, setBorrowingDeleteTarget] = useState<Transaction | null>(null)
  const [savingsDeleteTarget, setSavingsDeleteTarget] = useState<Transaction | null>(null)
  const [splitEdit, setSplitEdit] = useState<SplitEditState | null>(null)
  const [splitLegDeleteTarget, setSplitLegDeleteTarget] = useState<{ leg: Transaction; groupSize: number; groupTotal: number } | null>(null)
  const [reimbursePickerOpen, setReimbursePickerOpen] = useState(false)

  // Live bound on a reimbursement's amount: what the target still owes, plus this
  // row's own current value. Mirrors the `id <> NEW.id` self-exclusion in
  // mp_validate_reimbursement, so editing 400 down to 250 doesn't fail against
  // its own stale 400. The trigger remains the real backstop.
  const reimburseTargetId = editForm?.transaction_type === 'income' ? editForm.reimbursement_for : ''
  const reimburseRemaining = (() => {
    if (!reimburseTargetId || !editingTx) return 0
    const target = state.transactions.find(t => t.id === reimburseTargetId)
    if (!target) return 0
    return remainingReimbursable(target, state.transactions.filter(t => t.id !== editingTx.id))
  })()
  const reimburseAmount = evaluateAmountExpression(editForm?.amount ?? '') ?? 0
  const reimburseOverBy = reimburseTargetId ? Math.max(0, round2(reimburseAmount - reimburseRemaining)) : 0

  const handleDelete = async (t: Transaction) => {
    // Deleting a reimbursed expense doesn't delete the money that came back — the
    // FK is ON DELETE SET NULL — but it does turn it into ordinary income, which
    // moves the user's income figure. Name that before it happens.
    const linkedBack = reimbursementsFor(t, state.transactions)
    if (linkedBack.length > 0) {
      const total = linkedBack.reduce((s, r) => s + r.amount, 0)
      const ok = await confirm(
        `Delete "${t.description}" (${fmt(t.amount)})? ${fmt(total)} across ${linkedBack.length} ` +
        `reimbursement${linkedBack.length === 1 ? '' : 's'} will become ordinary income.`)
      if (!ok) return
    } else if (!await confirm(`Delete "${t.description}" (${fmt(t.amount)})?`)) return
    // Check if this transaction is linked to a borrowing
    if (t.borrowing_id) {
      setBorrowingDeleteTarget(t)
      return
    }
    // Check if this is a savings contribution — offer to also remove the savings record
    if (t.transaction_type === 'savings_contribution' && onDeleteSavings) {
      const linked = state.savings?.find(sv => sv.name === t.description)
      if (linked) {
        setSavingsDeleteTarget(t)
        return
      }
    }
    setDeleting(t.id)
    try { await onDelete(t) } catch (_) {}
    setDeleting(null)
  }

  const doDeleteWithSavingsChoice = async (t: Transaction, alsoDeleteSavings: boolean) => {
    setSavingsDeleteTarget(null)
    setDeleting(t.id)
    try {
      await onDelete(t)
      if (alsoDeleteSavings && onDeleteSavings) {
        const linked = state.savings?.find(sv => sv.name === t.description)
        if (linked) await onDeleteSavings(linked.id)
      }
    } catch (_) {}
    setDeleting(null)
  }

  const doDeleteWithBorrowingChoice = async (t: Transaction, reverseInTracker: boolean) => {
    setBorrowingDeleteTarget(null)
    setDeleting(t.id)
    try {
      if (reverseInTracker) await onReversePayment(t)
      else await onDelete(t)
    } catch (_) {}
    setDeleting(null)
  }

  // A split leg must never reach the single-row edit sheet: editing one leg's amount
  // in isolation would leave the legs no longer summing to the expense, with nothing
  // downstream able to catch it. Splits are always edited as a group.
  const openSplitEdit = (t: Transaction) => {
    const legs = splitGroupLegs(t, state.transactions)
    setSplitEdit({
      groupId: t.split_group_id!,
      description: t.description,
      amount: String(round2(legs.reduce((s, l) => s + l.amount, 0))),
      transaction_date: t.transaction_date,
      category_id: t.category_id || '',
      legs: legs.map(l => ({ id: l.id, accountId: l.from_account_id || l.credit_card_id || '', amount: l.amount })),
      originalLegIds: legs.map(l => l.id),
    })
  }

  const handleSplitSave = async () => {
    if (!splitEdit || !onUpdateSplitGroup) return
    const raw = evaluateAmountExpression(splitEdit.amount)
    const amount = raw === null ? NaN : round2(raw)
    if (!splitEdit.description.trim() || isNaN(amount) || !isSplitValid(splitEdit.legs, amount)) return
    setSaving(true)
    try {
      await onUpdateSplitGroup(
        splitEdit.groupId,
        {
          transaction_date: splitEdit.transaction_date,
          description: splitEdit.description.trim(),
          amount,
          category_id: splitEdit.category_id || null,
        },
        splitEdit.legs,
        splitEdit.originalLegIds,
      )
      setSplitEdit(null)
    } catch (_) {}
    setSaving(false)
  }

  const handleDeleteGroup = async (group: TransactionGroup) => {
    const groupId = group.primary.split_group_id
    if (!groupId || !onDeleteSplitGroup) return
    // Same warning as the single-row path: the money that came back survives as
    // ordinary income, which moves the user's income figure.
    const linkedBack = reimbursementsFor(group.primary, state.transactions)
    const backNote = linkedBack.length > 0
      ? ` ${fmt(linkedBack.reduce((s, r) => s + r.amount, 0))} across ${linkedBack.length} reimbursement${linkedBack.length === 1 ? '' : 's'} will become ordinary income.`
      : ''
    if (!await confirm(`Delete all ${group.groupSize} payments (${fmt(group.groupTotal)})?${backNote}`)) return
    setDeleting(group.key)
    try { await onDeleteSplitGroup(groupId) } catch (_) {}
    setDeleting(null)
  }

  const doDeleteSplitLeg = async (leg: Transaction, wholeSplit: boolean) => {
    setSplitLegDeleteTarget(null)
    setDeleting(leg.id)
    try {
      if (wholeSplit && leg.split_group_id) await onDeleteSplitGroup?.(leg.split_group_id)
      else await onDeleteSplitLeg?.(leg)
    } catch (_) {}
    setDeleting(null)
  }

  // How many optional things this transaction already carries. Drives the "N set"
  // badge, and forces the section open so a collapsed sheet never hides them.
  const editMoreCount = (() => {
    if (!editingTx || !editForm) return 0
    let n = 0
    if (editForm.event_id) n++
    if (editForm.master_id) n++
    if (pendingReceipt || (!removeReceiptFlag && editingTx.receipt_path)) n++
    if (reimbursementsFor(editingTx, state.transactions).length > 0) n++
    if (editForm.reimbursement_for) n++
    return n
  })()

  // Derived, never written to state: the sheet is reused across transactions, so
  // setting showEditMore here would leak one reimbursed expense's forced-open
  // into every later edit and quietly override the saved preference.
  //
  // A linked reimbursement forces it open regardless of preference — the summary
  // says what the expense ACTUALLY cost (₹154 net on a ₹408 gross), and hiding
  // that behind a collapsed row would misreport the number the user came to see.
  const editMoreOpen = showEditMore || editMoreCount > 0

  const openEdit = (t: Transaction) => {
    if (t.split_group_id && onUpdateSplitGroup) { openSplitEdit(t); return }
    setEditingTx(t)
    setEditForm({
      description: t.description,
      amount: String(t.amount),
      transaction_date: t.transaction_date,
      transaction_type: t.transaction_type,
      category_id: t.category_id || '',
      from_account_id: t.from_account_id || (t as any).credit_card_id || '',
      to_account_id: t.to_account_id || '',
      event_id: t.event_id || '',
      master_id: t.master_id || '',
      reimbursement_for: t.reimbursement_for || '',
    })
    setPendingReceipt(null)
    setRemoveReceiptFlag(false)
    setReceiptError(null)
    setLastSavedForm(null)
  }

  const closeEdit = () => {
    setEditingTx(null); setEditForm(null)
    setPendingReceipt(null); setRemoveReceiptFlag(false)
    setReceiptError(null); setLastSavedForm(null)
  }

  const openQuickCat = (e: React.MouseEvent, t: Transaction) => {
    e.stopPropagation()
    setQuickCatTx(t)
    setQuickCatId(t.category_id || '')
  }

  const handleQuickCatSave = async () => {
    if (!quickCatTx) return
    setQuickCatSaving(true)
    try {
      await onUpdate(quickCatTx, {
        description: quickCatTx.description,
        amount: quickCatTx.amount,
        transaction_date: quickCatTx.transaction_date,
        transaction_type: quickCatTx.transaction_type,
        category_id: quickCatId || null,
        from_account_id: quickCatTx.from_account_id || null,
        to_account_id: quickCatTx.to_account_id || null,
      })
      setQuickCatTx(null)
    } catch (_) {}
    setQuickCatSaving(false)
  }

  const handleEditSave = async () => {
    if (!editingTx || !editForm) return
    const rawAmount = evaluateAmountExpression(editForm.amount)
    const amount = rawAmount === null ? NaN : round2(rawAmount)
    if (!editForm.description.trim() || isNaN(amount) || amount <= 0) return
    setSaving(true)
    setReceiptError(null)

    const form: SavedFormSnapshot = {
      description: editForm.description.trim(),
      amount,
      transaction_date: editForm.transaction_date,
      transaction_type: editForm.transaction_type,
      category_id: editForm.category_id || null,
      from_account_id: editForm.from_account_id || null,
      to_account_id: editForm.transaction_type === 'transfer' ? (editForm.to_account_id || null) : null,
      // Only expenses belong to a life event.
      event_id: editForm.transaction_type === 'expense' ? (editForm.event_id || null) : null,
      // Same rule for the master, and the same explicit-null reasoning as
      // reimbursement_for below: this sheet renders the current value, so
      // clearing the field is a real instruction rather than an omission.
      master_id: editForm.transaction_type === 'expense' ? (editForm.master_id || null) : null,
      // Only incoming money can be a reimbursement. Explicit null (not undefined)
      // because this sheet does know the current value — it renders it — so an
      // unlink here is a real instruction, not an omission.
      reimbursement_for: editForm.transaction_type === 'income' ? (editForm.reimbursement_for || null) : null,
    }

    // If a previous attempt in this edit session already saved these exact core
    // fields (only the receipt step failed), skip onUpdate entirely on retry —
    // no need to touch balances again. If the form changed since then, fall back
    // to the freshest known transaction as the reversal baseline (state.transactions
    // is kept current by onUpdate's own setState) so the delta math can't
    // double-apply even across multiple edit-then-retry rounds.
    const unchanged = !!lastSavedForm
      && lastSavedForm.description === form.description
      && lastSavedForm.amount === form.amount
      && lastSavedForm.transaction_date === form.transaction_date
      && lastSavedForm.transaction_type === form.transaction_type
      && lastSavedForm.category_id === form.category_id
      && lastSavedForm.from_account_id === form.from_account_id
      && lastSavedForm.to_account_id === form.to_account_id
      && lastSavedForm.event_id === form.event_id
      && lastSavedForm.master_id === form.master_id
      && lastSavedForm.reimbursement_for === form.reimbursement_for

    if (!unchanged) {
      const updateBaseline = state.transactions.find(tx => tx.id === editingTx.id) ?? editingTx
      try {
        await onUpdate(updateBaseline, form)
        setLastSavedForm(form)
      } catch (err) {
        // The reimbursement triggers raise PT422 with a message written for the
        // user ("Only ₹8 can still be reimbursed…"). Silently swallowing it would
        // leave the Save button doing nothing on a rule we deliberately enforce.
        const msg = (err as { code?: string; message?: string } | null)?.code === 'PT422'
          ? (err as { message: string }).message
          : null
        setReceiptError(msg)
        setSaving(false)
        return
      }
    }

    try {
      if (pendingReceipt) await onUploadReceipt?.(editingTx.id, pendingReceipt)
      else if (removeReceiptFlag && editingTx.receipt_path) await onRemoveReceipt?.(editingTx)
      closeEdit()
    } catch (err) {
      const timedOut = err instanceof TimeoutError
      setReceiptError(pendingReceipt
        ? (timedOut ? 'Receipt upload timed out. Check your connection and tap Save Changes to retry.' : 'Could not attach receipt — tap Save Changes to retry.')
        : (timedOut ? 'Removing the receipt timed out. Check your connection and tap Save Changes to retry.' : 'Could not remove receipt — tap Save Changes to retry.'))
    }
    setSaving(false)
  }

  const clearFilters = () => {
    setSearch(''); setFilterAccount('all'); setFilterCategory('all')
    setFilterGroup('all'); setFilterEvent('all'); setFilterDateFrom(''); setFilterDateTo('')
  }
  const hasFilters = search || filterAccount !== 'all' || filterCategory !== 'all' ||
    filterGroup !== 'all' || filterDateFrom || filterDateTo

  const inp: React.CSSProperties = {
    width: '100%', background: c.surface2, border: `1.5px solid ${c.faint}`,
    borderRadius: 11, padding: '9px 12px', font: '600 13px Plus Jakarta Sans',
    color: c.ink, outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
      style={{
        position: 'fixed', inset: 0, background: c.bg, zIndex: 100,
        overflowY: dragX > 0 ? 'hidden' : 'auto',
        overscrollBehavior: 'contain',
        fontFamily: 'Plus Jakarta Sans, sans-serif',
        willChange: 'transform',
        ...(closing
          ? { transform: 'translateX(100%)', transition: 'transform 0.28s cubic-bezier(0.32,0.72,0,1)', animation: 'none' }
          : dragX > 0
          ? { transform: `translateX(${dragX}px)`, animation: 'none', boxShadow: '-8px 0 24px rgba(0,0,0,0.18)' }
          : snapping
          ? { transform: 'translateX(0)', transition: 'transform 0.28s cubic-bezier(0.32,0.72,0,1)', animation: 'none' }
          : entryPlayed
          ? {}
          : { animation: 'slideInFromRight 0.32s cubic-bezier(0.32,0.72,0,1)' }),
      }}
    >

      {/* Sticky header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: c.bg, borderBottom: `1px solid ${c.faint}` }}>

        {/* Title bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 'calc(12px + env(safe-area-inset-top, 0px)) 16px 12px' }}>
          <button onClick={triggerClose} style={{ width: 36, height: 36, borderRadius: 999, background: c.surface2, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.ink} strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ font: '800 20px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em' }}>All Transactions</div>
            <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>{filtered.length} entries · {fmt(totalFiltered)}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {hasFilters && (
              <button onClick={clearFilters} style={{ background: c.badSoft, color: c.bad, border: 'none', borderRadius: 999, padding: '6px 12px', font: '700 11px Plus Jakarta Sans', cursor: 'pointer' }}>
                Clear
              </button>
            )}
            {/* Export transactions */}
            <button
              onClick={() => setExportOpen(true)}
              title="Export transactions"
              style={{
                width: 36, height: 36, borderRadius: 999, border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                background: c.surface2,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.ink} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>
              </svg>
            </button>
            {/* Filter toggle */}
            <button
              onClick={() => setFiltersVisible(v => !v)}
              style={{
                width: 36, height: 36, borderRadius: 999, border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                background: filtersVisible ? c.accent : c.surface2,
                transition: 'background 0.2s ease',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={filtersVisible ? '#fff' : c.ink} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="6" x2="20" y2="6"/>
                <line x1="8" y1="12" x2="16" y2="12"/>
                <line x1="11" y1="18" x2="13" y2="18"/>
              </svg>
            </button>
            {/* Add transaction */}
            {onAdd && (
              <button
                onClick={onAdd}
                style={{
                  width: 36, height: 36, borderRadius: 999, border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  background: c.accent,
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Collapsible filters */}
        <div style={{
          overflow: 'hidden',
          maxHeight: filtersVisible ? '380px' : '0px',
          opacity: filtersVisible ? 1 : 0,
          transition: 'max-height 0.35s cubic-bezier(0.4,0,0.2,1), opacity 0.25s ease',
          willChange: 'max-height, opacity',
        }}>
          <div style={{ padding: '4px 16px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input placeholder="Search description..." value={search} onChange={e => setSearch(e.target.value)} style={inp} />
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={filterGroup} onChange={e => { setFilterGroup(e.target.value); setFilterCategory('all') }} style={{ ...inp, flex: 1 }}>
                <option value="all">All groups</option>
                {groups.map(g => <option key={g.id} value={g.name}>{g.name}</option>)}
              </select>
              <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={{ ...inp, flex: 1 }}>
                <option value="all">All categories</option>
                {state.categories.filter(cat => filterGroup === 'all' || cat.group_name === filterGroup).map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
              </select>
            </div>
            {state.events.length > 0 && (
              <select value={filterEvent} onChange={e => setFilterEvent(e.target.value)} style={inp}>
                <option value="all">All life events</option>
                <option value="none">Not part of an event</option>
                {state.events.map(ev => (
                  <option key={ev.id} value={ev.id}>{ev.name}</option>
                ))}
              </select>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={filterAccount} onChange={e => setFilterAccount(e.target.value)} style={{ ...inp, flex: 1 }}>
                <option value="all">All accounts</option>
                <optgroup label="Bank / Cash">
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </optgroup>
                {(state.credit_cards || []).length > 0 && (
                  <optgroup label="Credit Cards">
                    {(state.credit_cards || []).map(cc => <option key={cc.id} value={cc.id}>{cc.name}</option>)}
                  </optgroup>
                )}
              </select>
              <select value={sortKey} onChange={e => setSortKey(e.target.value as TxnSortKey)} style={{ ...inp, flex: 1 }}>
                <option value="date_desc">Newest first</option>
                <option value="date_asc">Oldest first</option>
                <option value="amount_desc">Highest amount</option>
                <option value="amount_asc">Lowest amount</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="date"
                value={filterDateFrom}
                onChange={e => {
                  setFilterDateFrom(e.target.value)
                  if (e.target.value && !filterDateTo) openDatePicker(dateToRef.current)
                }}
                style={{ ...inp, flex: 1 }}
              />
              <span style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, flexShrink: 0 }}>to</span>
              <input ref={dateToRef} type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} style={{ ...inp, flex: 1 }} />
            </div>
            <button
              onClick={() => setShowSystemTxns(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'none', border: `1.5px solid ${showSystemTxns ? c.accent : c.faint}`,
                borderRadius: 10, padding: '8px 12px', cursor: 'pointer',
                font: '600 12px Plus Jakarta Sans',
                color: showSystemTxns ? c.accent : c.muted,
                width: '100%',
              }}
            >
              <span style={{
                width: 16, height: 16, borderRadius: 4, border: `2px solid ${showSystemTxns ? c.accent : c.faint}`,
                background: showSystemTxns ? c.accent : 'transparent',
                flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {showSystemTxns && <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><polyline points="2 6 5 9 10 3"/></svg>}
              </span>
              Show system transactions (Opening Balance, Balance Adjustment)
            </button>
            <button
              onClick={() => setFiltersVisible(false)}
              style={{
                width: '100%', background: c.accent, color: '#fff', border: 'none',
                borderRadius: 12, padding: '12px', font: '700 14px Plus Jakarta Sans',
                cursor: 'pointer', marginTop: 4,
              }}
            >
              Done
            </button>
          </div>
        </div>
      </div>

      {/* List */}
      <div style={{ padding: '8px 16px calc(40px + env(safe-area-inset-bottom, 0px))' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', font: '600 14px Plus Jakarta Sans', color: c.muted }}>No transactions found</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 8 }}>
            {txnGroups.map((g, i) => {
              // An ordinary transaction is a one-leg group, so everything below is
              // exactly the code path it has always taken.
              const t = g.primary
              const collapsedSplit = g.isSplit && g.legs.length > 1
              // Recovered against this row (or its whole split group when collapsed).
              // Derived per render — nothing is stored, so unlink/delete are instant.
              const rowReimbursed = collapsedSplit
                ? g.legs.reduce((s, leg) => s + (rowRecovered.get(leg.id) ?? 0), 0)
                : (rowRecovered.get(t.id) ?? 0)
              const cat = catMap[t.category_id!]
              const col = (cat && CAT_COLORS[cat.name]) || c.muted
              const acc = state.accounts.find(a => a.id === t.from_account_id)
              const creditCard = !acc ? (state.credit_cards || []).find(cc => cc.id === t.from_account_id || cc.id === (t as any).credit_card_id) : null
              const toAcc = (t.transaction_type === 'transfer' || t.transaction_type === 'savings_withdrawal') && t.to_account_id ? state.accounts.find(a => a.id === t.to_account_id) : null
              const displayAcc = t.transaction_type === 'savings_withdrawal' ? toAcc : acc
              const accLabel = collapsedSplit ? '' : (t.transaction_type === 'transfer' && toAcc
                ? `${acc?.name || '?'} → ${toAcc.name}`
                : displayAcc ? displayAcc.name : acc ? acc.name : creditCard ? creditCard.name : '')
              const accIdx = acc ? state.accounts.findIndex(a => a.id === acc.id) : -1
              const accColor = acc ? ACCOUNT_PALETTE[Math.max(0, accIdx) % ACCOUNT_PALETTE.length] : creditCard ? '#6366F1' : c.muted
              const isDeleting = deleting === g.key
              const prevDate = i > 0 ? txnGroups[i - 1].primary.transaction_date : null
              const showDateHeader = t.transaction_date !== prevDate

              // "Axis ₹20,000 · Cash ₹10,000" — only rendered for a collapsed split.
              const legBreakdown = collapsedSplit
                ? g.legs.map(l => {
                    const a = state.accounts.find(x => x.id === l.from_account_id)
                    const cc = !a ? (state.credit_cards || []).find(x => x.id === l.credit_card_id) : null
                    return `${a?.name || cc?.name || '?'} ${fmt(l.amount, { decimals: l.amount % 1 ? 2 : 0 })}`
                  }).join(' · ')
                : ''

              const onDeleteClick = () => {
                if (collapsedSplit) return handleDeleteGroup(g)
                if (g.isSplit) return setSplitLegDeleteTarget({ leg: t, groupSize: g.groupSize, groupTotal: g.groupTotal })
                return handleDelete(t)
              }

              return (
                <div key={g.key}>
                  {showDateHeader && (
                    <div style={{ font: '700 11px Plus Jakarta Sans', color: c.muted, letterSpacing: '0.04em', textTransform: 'uppercase', padding: '14px 0 6px' }}>
                      {fmtDate(t.transaction_date)}
                    </div>
                  )}
                  <div
                    onClick={() => !isDeleting && openEdit(t)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, background: c.surface, borderRadius: 16, padding: '12px 14px', border: `1px solid ${c.faint}`, opacity: isDeleting ? 0.5 : 1, cursor: 'pointer', transition: 'opacity 0.15s' }}
                  >
                    <div style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, background: col + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '800 15px Plus Jakarta Sans', color: col }}>
                      {t.description.slice(0, 1).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.description}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                        {t.receipt_path && (
                          <span style={{ display: 'flex', alignItems: 'center', color: c.muted, background: c.surface2, borderRadius: 999, padding: '2px 6px' }}>
                            <Receipt size={11} />
                          </span>
                        )}
                        {t.transaction_type === 'savings_contribution' && (
                          <span style={{ font: '600 10px Plus Jakarta Sans', color: '#10B981', background: 'rgba(16,185,129,0.1)', borderRadius: 999, padding: '2px 7px' }}>Savings</span>
                        )}
                        {t.transaction_type === 'savings_withdrawal' && (
                          <span style={{ font: '600 10px Plus Jakarta Sans', color: '#10B981', background: 'rgba(16,185,129,0.1)', borderRadius: 999, padding: '2px 7px' }}>Withdrawal</span>
                        )}
                        {(t.transaction_type === 'opening_balance' || t.transaction_type === 'balance_adjustment' || t.transaction_type === 'cc_opening_balance' || t.transaction_type === 'cc_balance_adjustment') ? (
                          <span style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, background: c.surface2, borderRadius: 999, padding: '2px 7px' }}>
                            {(t.transaction_type === 'opening_balance' || t.transaction_type === 'cc_opening_balance') ? 'Opening Balance' : 'Balance Adjustment'}
                          </span>
                        ) : cat && t.transaction_type !== 'savings_contribution' && t.transaction_type !== 'savings_withdrawal'
                          ? <span style={{ font: '600 10px Plus Jakarta Sans', color: col, background: col + '18', borderRadius: 999, padding: '2px 7px' }}>{cat.name}</span>
                          : t.transaction_type !== 'transfer' && t.transaction_type !== 'savings_contribution' && t.transaction_type !== 'savings_withdrawal' && (
                            <span
                              onClick={e => openQuickCat(e, t)}
                              style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, background: c.surface2, borderRadius: 999, padding: '2px 7px', border: `1px dashed ${c.faint}`, cursor: 'pointer' }}
                            >
                              + category
                            </span>
                          )
                        }
                        {accLabel && <span style={{ font: '600 10px Plus Jakarta Sans', color: accColor, background: accColor + '18', borderRadius: 999, padding: '2px 7px' }}>{accLabel}</span>}
                        {g.isSplit && (
                          <span style={{ font: '600 10px Plus Jakarta Sans', color: c.accent, background: c.accentSoft, borderRadius: 999, padding: '2px 7px' }}>
                            {collapsedSplit ? `Split · ${g.groupSize}` : 'Split'}
                          </span>
                        )}
                        {t.reimbursement_for && (
                          <span style={{ font: '600 10px Plus Jakarta Sans', color: c.accent, background: c.accentSoft, borderRadius: 999, padding: '2px 7px' }}>Reimbursement</span>
                        )}
                        {/* Who/where. Display-only in v1.61 — the edit sheet doesn't
                            carry masters yet, and a chip that looks tappable but isn't
                            is worse than a plain label.

                            masterById returns null for a SOFT-DELETED master (they're
                            loaded with deleted_at IS NULL while the tag survives on the
                            row), and we render nothing rather than "Unknown". */}
                        {(() => {
                          const mst = masterById(state.masters, t.master_id)
                          if (!mst) return null
                          const ma = MASTER_ACCENTS[mst.type]
                          return (
                            <span style={{ font: '600 10px Plus Jakarta Sans', color: ma.solid, background: ma.soft, borderRadius: 999, padding: '2px 7px' }}>
                              {mst.name}
                            </span>
                          )
                        })()}
                        {rowReimbursed > 0 && (
                          <span style={{ font: '600 10px Plus Jakarta Sans', color: c.good, background: c.good + '18', borderRadius: 999, padding: '2px 7px' }}>
                            Reimbursed {fmt(rowReimbursed)}
                          </span>
                        )}
                        {(state.settings.challenge_excluded_txn_ids ?? []).includes(t.id) && (
                          <span style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, background: c.surface2, borderRadius: 999, padding: '2px 7px', border: `1px dashed ${c.faint}` }}>excl. challenge</span>
                        )}
                      </div>
                      {legBreakdown && (
                        <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {legBreakdown}
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                        <div style={{ font: '800 14px Plus Jakarta Sans', color:
                          t.transaction_type === 'income' ? c.good :
                          t.transaction_type === 'opening_balance' ? c.good :
                          t.transaction_type === 'balance_adjustment' ? (t.to_account_id ? c.good : c.muted) :
                          t.transaction_type === 'credit_card_payment' ? c.muted :
                          t.transaction_type === 'savings_withdrawal' ? '#10B981' :
                          t.transaction_type === 'savings_contribution' ? '#10B981' :
                          t.transaction_type === 'transfer' ? c.accent :
                          (t.transaction_type === 'borrowing' || t.transaction_type === 'borrowing_repayment') ? '#6366F1' :
                          c.bad }}>
                          {(t.transaction_type === 'income' || t.transaction_type === 'savings_withdrawal' || t.transaction_type === 'opening_balance') ? '+' :
                           t.transaction_type === 'balance_adjustment' ? (t.to_account_id ? '+' : '−') :
                           t.transaction_type === 'credit_card_payment' ? '⇄' :
                           t.transaction_type === 'savings_contribution' ? '−' :
                           t.transaction_type === 'transfer' ? '⇄' :
                           (t.transaction_type === 'borrowing' || t.transaction_type === 'borrowing_repayment')
                             ? (t.is_credit ? '+' : '−')
                             : '−'}{fmt(g.total, { decimals: g.total % 1 ? 2 : 0 })}
                        </div>
                        <div style={{ font: '500 10px Plus Jakarta Sans', color: c.muted }}>{fmtTime(t.created_at)}</div>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); onDeleteClick() }}
                        disabled={isDeleting}
                        style={{ background: '#FEE2E2', border: 'none', borderRadius: 8, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.2" strokeLinecap="round">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
            {!allTransactionsLoaded && onLoadMore && (
              <div ref={sentinelRef} style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
                {loadingMore ? (
                  <span style={{ font: '600 13px Plus Jakarta Sans', color: c.muted }}>Loading more...</span>
                ) : (
                  <button onClick={onLoadMore} style={{ background: c.surface2, color: c.muted, border: `1.5px solid ${c.faint}`, borderRadius: 12, padding: '10px 24px', font: '700 13px Plus Jakarta Sans', cursor: 'pointer' }}>
                    Load more
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Edit Sheet */}
      <BottomSheet open={!!(editingTx && editForm)} onClose={closeEdit} maxHeight="88svh" zIndex={300}>
            <div style={{ font: '800 18px Plus Jakarta Sans', color: c.ink, marginBottom: 16, letterSpacing: '-0.02em' }}>Edit Transaction</div>

            {editForm && <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <Label>Description</Label>
                <HelpText>What this transaction was for.</HelpText>
                <input
                  value={editForm.description}
                  onChange={e => setEditForm(f => f ? { ...f, description: e.target.value } : f)}
                  style={inp}
                  placeholder="Description"

                />
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <Label>Amount</Label>
                  <HelpText>Transaction amount in rupees.</HelpText>
                  <div style={{ position: 'relative' }}>
                  <input
                    ref={editAmountRef}
                    className={editAmountSelectAll ? 'amt-selectall' : undefined}
                    type="text"
                    inputMode="decimal"
                    value={editForm.amount}
                    onChange={e => {
                      setEditAmountSelectAll(false)
                      setEditForm(f => f ? { ...f, amount: sanitizeAmountInput(e.target.value) } : f)
                    }}
                    onFocus={e => { selectOnFocus(e.target); setEditAmountFocused(true); setEditAmountSelectAll(true) }}
                    onPointerDown={e => {
                      // A tap on an already-focused field is the user placing a caret —
                      // that cancels select-all. A tap that causes the focus doesn't.
                      if (document.activeElement === e.currentTarget) setEditAmountSelectAll(false)
                    }}
                    onBlur={e => {
                      setEditAmountFocused(false)
                      setEditAmountSelectAll(false)
                      const r = evaluateAmountExpression(e.target.value)
                      setEditForm(f => f ? { ...f, amount: r === null ? '' : String(round2(r)) } : f)
                    }}
                    onKeyDown={e => {
                      // No clearing here — keydown lands before beforeinput, and that
                      // handler needs the flag still set to swallow the first keystroke.
                      if (e.key !== 'Enter') return
                      const r = evaluateAmountExpression(e.currentTarget.value)
                      setEditForm(f => f ? { ...f, amount: r === null ? '' : String(round2(r)) } : f)
                    }}
                    style={editAmountSelectAll
                      // No caret while the pill is up — a select-all doesn't show one,
                      // and the engine may have parked it at 0, on top of the digits.
                      ? { ...inp, color: 'transparent', WebkitTextFillColor: 'transparent', caretColor: 'transparent' }
                      : inp}
                    placeholder="0"
                  />
                  {editAmountSelectAll && editForm.amount !== '' && (
                    // The painted stand-in for the selection the engine won't draw. Same
                    // font and box as the input, so the pill lands exactly on the digits.
                    <div aria-hidden className="amt-selectall-mirror" style={{
                      position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                      padding: '9px 13.5px', font: '600 13px Plus Jakarta Sans',
                      pointerEvents: 'none', overflow: 'hidden', whiteSpace: 'pre', boxSizing: 'border-box',
                    }}>
                      <span style={{ background: c.accent, color: '#fff', borderRadius: 3, padding: '0 1px' }}>
                        {editForm.amount}
                      </span>
                    </div>
                  )}
                  </div>
                  {editAmountFocused && (
                    <AmountOperatorRow
                      inputRef={editAmountRef}
                      onChange={v => { setEditAmountSelectAll(false); setEditForm(f => f ? { ...f, amount: v } : f) }}
                    />
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <Label>Date</Label>
                  <HelpText>When this transaction occurred.</HelpText>
                  <input
                    type="date"
                    value={editForm.transaction_date}
                    onChange={e => setEditForm(f => f ? { ...f, transaction_date: e.target.value } : f)}
                    style={inp}
                  />
                </div>
              </div>

              <div>
                <Label>Type</Label>
                <select value={editForm.transaction_type} disabled style={{ ...inp, opacity: 0.5, cursor: 'not-allowed' }}>
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                  <option value="transfer">Transfer</option>
                  <option value="commitment">Commitment</option>
                  <option value="borrowing">Borrowing</option>
                  <option value="borrowing_repayment">Borrowing Repayment</option>
                  <option value="savings_contribution">Savings Contribution</option>
                  <option value="savings_withdrawal">Savings Withdrawal</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                {editForm.transaction_type !== 'transfer' && editForm.transaction_type !== 'savings_contribution' && editForm.transaction_type !== 'savings_withdrawal' && (
                  <div style={{ flex: 1 }}>
                    <Label>Category</Label>
                    <HelpText>Used for spending analytics and reports.</HelpText>
                    {editingTx?.borrowing_id ? (
                      <div style={{ ...inp, opacity: 0.5, cursor: 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>{state.categories.find(c => c.id === editForm.category_id)?.name || 'Uncategorized'}</span>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                      </div>
                    ) : (
                      <CategorySelect
                        value={editForm.category_id}
                        onChange={v => setEditForm(f => f ? { ...f, category_id: v } : f)}
                        state={state}
                        onAddCategory={onAddCategory}
                        style={inp}
                        includeEmpty
                        emptyLabel="No category"
                      />
                    )}
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <Label>{editForm.transaction_type === 'transfer' || editForm.transaction_type === 'savings_contribution' ? 'From' : editForm.transaction_type === 'savings_withdrawal' ? 'To Account' : 'Account'}</Label>
                  <HelpText>Which account was debited or credited.</HelpText>
                  <select
                    value={editForm.from_account_id}
                    onChange={e => setEditForm(f => f ? { ...f, from_account_id: e.target.value } : f)}
                    style={inp}
                  >
                    <option value="">No account</option>
                    <optgroup label="Bank / Cash">
                      {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </optgroup>
                    {(state.credit_cards || []).length > 0 && !['income', 'borrowing', 'transfer', 'savings_contribution', 'savings_withdrawal'].includes(editForm.transaction_type) && (
                      <optgroup label="Credit Cards">
                        {(state.credit_cards || []).map(cc => <option key={cc.id} value={cc.id}>{cc.name}</option>)}
                      </optgroup>
                    )}
                  </select>
                </div>
                {(editForm.transaction_type === 'transfer') && (
                  <div style={{ flex: 1 }}>
                    <Label>To</Label>
                    <select
                      value={editForm.to_account_id}
                      onChange={e => setEditForm(f => f ? { ...f, to_account_id: e.target.value } : f)}
                      style={inp}
                    >
                      <option value="">No account</option>
                      <optgroup label="Bank / Cash">
                        {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </optgroup>
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* Optional fields, folded away so the sheet stays short. Auto-opens
                when something inside is already set — see editMoreCount /
                editMoreForceOpen — because a collapsed section must never hide a
                value, least of all a reimbursement that changes what this expense
                actually cost. */}
            {editingTx && editForm && (
              <div style={{ marginTop: 16 }}>
                <button
                  type="button"
                  onClick={toggleEditMore}
                  style={{
                    width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 12,
                    border: `1.5px solid ${c.faint}`, background: 'transparent', color: c.muted,
                    font: '700 12px Plus Jakarta Sans', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 7,
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    style={{ flexShrink: 0, transition: 'transform 0.2s', transform: editMoreOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                  <span>
                    More options
                    {!editMoreOpen && editMoreCount > 0 && ` · ${editMoreCount} set`}
                  </span>
                </button>
              </div>
            )}

            {editMoreOpen && editingTx && editForm?.transaction_type === 'expense' && (
              <div style={{ marginTop: 12 }}>
                <ReceiptField
                  pendingReceipt={pendingReceipt}
                  existingPath={removeReceiptFlag ? null : editingTx.receipt_path ?? null}
                  onPick={setPendingReceipt}
                  onRemovePending={() => setPendingReceipt(null)}
                  onRemoveExisting={() => { setRemoveReceiptFlag(true); setPendingReceipt(null) }}
                  getUrl={getReceiptUrl}
                />
              </div>
            )}
            {/* One adaptive event chip — the place people actually are when they
                realise a run of expenses belongs together. Always rendered on an
                expense, including when no event exists yet, because the chip is
                itself a discovery surface. */}
            {editMoreOpen && editingTx && editForm?.transaction_type === 'expense' && (() => {
              const attached = state.events.find(ev => ev.id === editForm.event_id)
              return (
                <div style={{ marginTop: 16 }}>
                  <div style={{ font: '700 11px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                    Life event
                  </div>
                  <EventChip
                    label={attached ? attached.name : '+ Add to Event'}
                    icon={attached?.icon}
                    active={!!attached}
                    onClick={() => setEventPickerOpen(true)}
                  />
                </div>
              )
            })()}

            {/* Who / where. v1.61 shipped this as create-only, which left a
                mistagged expense permanently wrong — this is the fix. */}
            {editMoreOpen && editingTx && editForm?.transaction_type === 'expense' && state.masters.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ font: '700 11px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                  Who / where
                </div>
                <MasterSelect
                  value={editForm.master_id}
                  onChange={v => setEditForm(f => f ? { ...f, master_id: v } : f)}
                  state={state}
                  onAddMaster={onAddMaster}
                  includeEmpty
                  emptyLabel="None"
                  style={inp}
                />
              </div>
            )}

            {/* Reimbursement summary — what this expense actually cost, plus the
                reverse entry point. This is where the need usually arises: you are
                looking at the ₹408 gift when the friend pays you back. */}
            {editMoreOpen && editingTx && editForm && (editForm.transaction_type === 'expense' || editForm.transaction_type === 'commitment') && (() => {
              const linked = reimbursementsFor(editingTx, state.transactions)
              const summary = reimbursementSummary(editingTx, state.transactions)
              // Nothing linked and no way to link: a bare section header would be
              // an empty promise.
              if (linked.length === 0 && !onRecordReimbursement) return null
              return (
                <div style={{ marginTop: 16 }}>
                  <div style={{ font: '700 11px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                    Reimbursement
                  </div>
                  {linked.length > 0 && (
                    <div style={{ background: c.surface2, borderRadius: 14, padding: '12px 14px', marginBottom: 8 }}>
                      {([
                        ['Original expense', fmt(summary.gross), c.ink],
                        ['Reimbursed', '-' + fmt(summary.reimbursed), c.good],
                        ['Net expense', fmt(summary.net), c.ink],
                      ] as const).map(([label, value, colour], i) => (
                        <div key={label} style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: i === 2 ? '8px 0 0' : '0 0 6px',
                          borderTop: i === 2 ? '1px solid ' + c.faint : 'none',
                          marginTop: i === 2 ? 2 : 0,
                        }}>
                          <span style={{ font: (i === 2 ? '700' : '600') + ' 12.5px Plus Jakarta Sans', color: i === 2 ? c.ink : c.muted }}>{label}</span>
                          <span style={{ font: (i === 2 ? '800 15px' : '700 13px') + ' Plus Jakarta Sans', color: colour }}>{value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {linked.map(r => (
                    <div key={r.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 12px', borderRadius: 11, background: c.surface2, marginBottom: 6,
                    }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ font: '600 12.5px Plus Jakarta Sans', color: c.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {r.description}
                        </div>
                        <div style={{ font: '600 10.5px Plus Jakarta Sans', color: c.muted }}>
                          {fmtDate(r.transaction_date)}
                        </div>
                      </div>
                      <div style={{ font: '700 13px Plus Jakarta Sans', color: c.good, flexShrink: 0, marginLeft: 10 }}>+{fmt(r.amount)}</div>
                    </div>
                  ))}
                  {summary.net > 0 && (
                    <button
                      type="button"
                      // Close this sheet first. Quick Add renders its own shell
                      // inside the phone frame, while this is a portalled
                      // BottomSheet at zIndex 300 — leaving it open buries Quick
                      // Add behind it. Leaving the expense is also the right
                      // model: you're going off to record the money coming back.
                      onClick={() => { const tx = editingTx; closeEdit(); onRecordReimbursement?.(tx, summary.net) }}
                      style={{
                        width: '100%', padding: '10px 0', borderRadius: 12,
                        border: '1.5px dashed ' + c.accent, background: 'transparent',
                        color: c.accent, font: '700 12.5px Plus Jakarta Sans', cursor: 'pointer',
                      }}
                    >
                      + Record reimbursement · {fmt(summary.net)} left
                    </button>
                  )}
                </div>
              )
            })()}

            {/* The other side of the link: an incoming row that repays an expense.
                Never rendered as salary or plain income. */}
            {editMoreOpen && editingTx && editForm?.transaction_type === 'income' && (() => {
              const target = editForm.reimbursement_for
                ? state.transactions.find(t => t.id === editForm.reimbursement_for) ?? null
                : null
              return (
                <div style={{ marginTop: 16 }}>
                  <div style={{ font: '700 11px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                    Purpose
                  </div>
                  {target ? (
                    <div style={{ background: c.surface2, borderRadius: 14, padding: '12px 14px' }}>
                      <span style={{ font: '600 10px Plus Jakarta Sans', color: c.accent, background: c.accentSoft, borderRadius: 999, padding: '2px 7px' }}>
                        Reimbursement
                      </span>
                      <div style={{ font: '600 12.5px Plus Jakarta Sans', color: c.ink, marginTop: 8 }}>
                        Reimburses: {target.description}
                      </div>
                      <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>
                        {fmtDate(target.transaction_date)} · {fmt(target.amount)}
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                        <button type="button" onClick={() => setReimbursePickerOpen(true)} style={{
                          flex: 1, padding: '8px 0', borderRadius: 10, border: '1.5px solid ' + c.faint,
                          background: 'transparent', color: c.ink, font: '700 12px Plus Jakarta Sans', cursor: 'pointer',
                        }}>Change</button>
                        <button type="button" onClick={() => setEditForm(f => f && ({ ...f, reimbursement_for: '' }))} style={{
                          flex: 1, padding: '8px 0', borderRadius: 10, border: '1.5px solid ' + c.faint,
                          background: 'transparent', color: c.bad, font: '700 12px Plus Jakarta Sans', cursor: 'pointer',
                        }}>Unlink</button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setReimbursePickerOpen(true)} style={{
                      width: '100%', padding: '10px 0', borderRadius: 12,
                      border: '1.5px dashed ' + c.faint, background: 'transparent',
                      color: c.muted, font: '700 12.5px Plus Jakarta Sans', cursor: 'pointer',
                    }}>+ Link to an expense</button>
                  )}
                  {reimburseOverBy > 0 && (
                    <div style={{ font: '600 11px Plus Jakarta Sans', color: c.bad, marginTop: 8 }}>
                      Only {fmt(reimburseRemaining)} can still be reimbursed on that expense.
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Challenge exclusion toggle — only for expenses when challenge is active */}
            {editingTx && editForm?.transaction_type === 'expense' && (state.settings.challenge_enabled ?? false) && onToggleChallengeExclusion && (() => {
              const isExcluded = (state.settings.challenge_excluded_txn_ids ?? []).includes(editingTx.id)
              return (
                <div style={{ marginTop: 16, background: c.surface2, borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ font: '600 13px Plus Jakarta Sans', color: c.ink }}>Exclude from Daily Challenge</div>
                    <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>
                      {isExcluded ? "This transaction won't count toward today's goal" : "This transaction counts toward today's spending goal"}
                    </div>
                  </div>
                  <button
                    onClick={() => onToggleChallengeExclusion(editingTx.id)}
                    style={{
                      flexShrink: 0, padding: '6px 14px', borderRadius: 99, cursor: 'pointer',
                      font: '700 12px Plus Jakarta Sans',
                      background: isExcluded ? c.good + '22' : c.surface,
                      color: isExcluded ? c.good : c.muted,
                      border: `1.5px solid ${isExcluded ? c.good + '55' : c.faint}`,
                    }}
                  >
                    {isExcluded ? 'Excluded' : 'Exclude'}
                  </button>
                </div>
              )
            })()}

            {receiptError && (
              <div style={{ marginTop: 12, font: '600 12px Plus Jakarta Sans', color: c.bad, lineHeight: 1.5 }}>
                {receiptError}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button
                onClick={closeEdit}
                style={{ flex: 1, background: c.surface2, color: c.muted, border: 'none', borderRadius: 14, padding: '14px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleEditSave}
                disabled={saving || reimburseOverBy > 0}
                style={{ flex: 2, background: c.accent, color: '#fff', border: 'none', borderRadius: 14, padding: '14px', font: '700 14px Plus Jakarta Sans', cursor: saving || reimburseOverBy > 0 ? 'not-allowed' : 'pointer', opacity: saving || reimburseOverBy > 0 ? 0.7 : 1 }}
              >
                {saving ? 'Saving...' : reimburseOverBy > 0 ? 'Amount exceeds remaining' : 'Save Changes'}
              </button>
            </div>
            </>}
      </BottomSheet>

      {/* Split edit sheet — a split is always edited as one transaction, so there is
          no path here that changes a single leg's amount on its own. */}
      <BottomSheet open={!!splitEdit} onClose={() => setSplitEdit(null)} maxHeight="88svh" zIndex={300}>
        <div style={{ font: '800 18px Plus Jakarta Sans', color: c.ink, marginBottom: 16, letterSpacing: '-0.02em' }}>Edit Split Payment</div>

        {splitEdit && (() => {
          const parsed = evaluateAmountExpression(splitEdit.amount)
          const total = parsed === null ? NaN : round2(parsed)
          const canSave = !!splitEdit.description.trim() && !isNaN(total) && isSplitValid(splitEdit.legs, total)

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <Label>Description</Label>
                <HelpText>Shared by every payment in this split.</HelpText>
                <input
                  value={splitEdit.description}
                  onChange={e => setSplitEdit(f => f ? { ...f, description: e.target.value } : f)}
                  style={inp}
                  placeholder="Description"
                />
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <Label>Amount</Label>
                  <HelpText>The payments below must add up to this.</HelpText>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={splitEdit.amount}
                    onChange={e => setSplitEdit(f => f ? { ...f, amount: sanitizeAmountInput(e.target.value) } : f)}
                    onFocus={e => selectOnFocus(e.target)}
                    onBlur={e => {
                      const r = evaluateAmountExpression(e.target.value)
                      setSplitEdit(f => f ? { ...f, amount: r === null ? '' : String(round2(r)) } : f)
                    }}
                    style={inp}
                    placeholder="0"
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <Label>Date</Label>
                  <HelpText>When this expense occurred.</HelpText>
                  <input
                    type="date"
                    value={splitEdit.transaction_date}
                    onChange={e => setSplitEdit(f => f ? { ...f, transaction_date: e.target.value } : f)}
                    style={inp}
                  />
                </div>
              </div>

              <div>
                <Label>Category</Label>
                <HelpText>Used for spending analytics and reports.</HelpText>
                <CategorySelect
                  value={splitEdit.category_id}
                  onChange={v => setSplitEdit(f => f ? { ...f, category_id: v } : f)}
                  state={state}
                  onAddCategory={onAddCategory}
                  style={inp}
                />
              </div>

              <div>
                <Label>Payments</Label>
                <HelpText>Which accounts this expense was paid from.</HelpText>
                <SplitLegsEditor
                  legs={splitEdit.legs}
                  onChange={legs => setSplitEdit(f => f ? { ...f, legs } : f)}
                  total={isNaN(total) ? 0 : total}
                  accounts={state.accounts.filter(a => a.is_active)}
                  creditCards={state.credit_cards || []}
                />
              </div>

              {/* Splits are reimbursed as a group, so the summary and the reverse
                  entry point belong here too — a split gift is one ₹408 expense as
                  far as the person who got paid back is concerned.

                  Folded behind the same disclosure as the ordinary edit sheet, so
                  the two edit paths look alike. It opens itself once anything is
                  linked: the summary is what the split ACTUALLY cost, and that is
                  never something to hide behind a collapsed row. */}
              {(() => {
                const anchor = state.transactions.find(t => t.split_group_id === splitEdit.groupId)
                if (!anchor) return null
                const linked = reimbursementsFor(anchor, state.transactions)
                const summary = reimbursementSummary(anchor, state.transactions)
                if (linked.length === 0 && !onRecordReimbursement) return null
                const open = showEditMore || linked.length > 0
                return (
                  <>
                    <button
                      type="button"
                      onClick={toggleEditMore}
                      style={{
                        width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 12,
                        border: `1.5px solid ${c.faint}`, background: 'transparent', color: c.muted,
                        font: '700 12px Plus Jakarta Sans', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 7,
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                        style={{ flexShrink: 0, transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                      <span>More options{!open && linked.length > 0 && ` · ${linked.length} set`}</span>
                    </button>
                    {open && (
                  <div>
                    <Label>Reimbursement</Label>
                    {linked.length > 0 && (
                      <div style={{ background: c.surface2, borderRadius: 14, padding: '12px 14px', marginBottom: 8 }}>
                        {([
                          ['Original expense', fmt(summary.gross), c.ink],
                          ['Reimbursed', '-' + fmt(summary.reimbursed), c.good],
                          ['Net expense', fmt(summary.net), c.ink],
                        ] as const).map(([label, value, colour], i) => (
                          <div key={label} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: i === 2 ? '8px 0 0' : '0 0 6px',
                            borderTop: i === 2 ? '1px solid ' + c.faint : 'none',
                            marginTop: i === 2 ? 2 : 0,
                          }}>
                            <span style={{ font: (i === 2 ? '700' : '600') + ' 12.5px Plus Jakarta Sans', color: i === 2 ? c.ink : c.muted }}>{label}</span>
                            <span style={{ font: (i === 2 ? '800 15px' : '700 13px') + ' Plus Jakarta Sans', color: colour }}>{value}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {onRecordReimbursement && summary.net > 0 && (
                      <button
                        type="button"
                        onClick={() => { setSplitEdit(null); onRecordReimbursement(anchor, summary.net) }}
                        style={{
                          width: '100%', padding: '10px 0', borderRadius: 12,
                          border: '1.5px dashed ' + c.accent, background: 'transparent',
                          color: c.accent, font: '700 12.5px Plus Jakarta Sans', cursor: 'pointer',
                        }}
                      >
                        + Record reimbursement · {fmt(summary.net)} left
                      </button>
                    )}
                  </div>
                    )}
                  </>
                )
              })()}

              <button
                onClick={handleSplitSave}
                disabled={!canSave || saving}
                style={{
                  width: '100%', marginTop: 4, border: 'none', borderRadius: 12, padding: '13px',
                  font: '700 14px Plus Jakarta Sans', cursor: canSave && !saving ? 'pointer' : 'not-allowed',
                  background: canSave && !saving ? c.accent : c.faint, color: canSave && !saving ? '#fff' : c.muted,
                }}
              >
                {saving ? 'Saving...' : canSave ? 'Save Changes' : 'Payments must add up to the total'}
              </button>

              <button
                onClick={async () => {
                  const groupId = splitEdit.groupId
                  if (!await confirm(`Delete all ${splitEdit.legs.length} payments (${fmt(isNaN(total) ? 0 : total)})?`)) return
                  setSplitEdit(null)
                  setDeleting(groupId)
                  try { await onDeleteSplitGroup?.(groupId) } catch (_) {}
                  setDeleting(null)
                }}
                style={{ width: '100%', background: 'none', color: c.bad, border: 'none', padding: '8px', font: '600 13px Plus Jakarta Sans', cursor: 'pointer' }}
              >
                Delete this split
              </button>
            </div>
          )
        })()}
      </BottomSheet>

      {/* Quick categorize sheet */}
      <BottomSheet open={!!quickCatTx} onClose={() => setQuickCatTx(null)} zIndex={350} showHelpButton={false}>
        <div style={{ font: '800 17px Plus Jakarta Sans', color: c.ink, marginBottom: 4 }}>Set Category</div>
        <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginBottom: 16 }}>{quickCatTx?.description}</div>
        <CategorySelect
          value={quickCatId}
          onChange={setQuickCatId}
          state={state}
          onAddCategory={onAddCategory}
          style={{ width: '100%', boxSizing: 'border-box', background: c.surface2, border: `1.5px solid ${c.faint}`, borderRadius: 11, padding: '10px 12px', font: '600 14px Plus Jakarta Sans', color: c.ink, outline: 'none' }}
          includeEmpty
          emptyLabel="None"
          filterGroup={quickCatTx?.transaction_type === 'income' ? 'Income' : undefined}
        />
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button onClick={() => setQuickCatTx(null)} style={{ flex: 1, background: c.surface2, color: c.muted, border: 'none', borderRadius: 14, padding: '13px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleQuickCatSave} disabled={quickCatSaving} style={{ flex: 2, background: c.accent, color: '#fff', border: 'none', borderRadius: 14, padding: '13px', font: '700 14px Plus Jakarta Sans', cursor: quickCatSaving ? 'not-allowed' : 'pointer', opacity: quickCatSaving ? 0.7 : 1 }}>
            {quickCatSaving ? 'Saving...' : 'Save Category'}
          </button>
        </div>
      </BottomSheet>

      <ExportTransactionsSheet
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        state={state}
        userId={userId}
        allTransactionsLoaded={!!allTransactionsLoaded}
        initialFilters={{ search, account: filterAccount, category: filterCategory, group: filterGroup, event: filterEvent, dateFrom: filterDateFrom, dateTo: filterDateTo, showSystemTxns }}
        initialSortKey={sortKey}
      />

      {/* Event picker — opened by the adaptive chip. Kept local to this page so
          creating an event can attach it to the row being edited without any
          cross-component plumbing, and without closing the edit sheet. */}
      <BottomSheet open={eventPickerOpen} onClose={() => setEventPickerOpen(false)} showHelpButton={false} zIndex={320}>
        <div style={{ padding: '0 4px 16px' }}>
          <div style={{ font: '800 18px Plus Jakarta Sans', color: c.ink, marginBottom: 16 }}>Life event</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <EventPickerRow
              label="None"
              selected={!editForm?.event_id}
              onClick={() => { setEditForm(f => f ? { ...f, event_id: '' } : f); setEventPickerOpen(false) }}
            />
            {state.events
              .filter(ev => ev.status === 'active' || ev.id === editForm?.event_id)
              .map(ev => (
                <EventPickerRow
                  key={ev.id}
                  label={ev.name}
                  icon={ev.icon}
                  selected={editForm?.event_id === ev.id}
                  onClick={() => { setEditForm(f => f ? { ...f, event_id: ev.id } : f); setEventPickerOpen(false) }}
                />
              ))}
            <EventPickerRow
              label="+ New event"
              accent
              onClick={() => { setEventPickerOpen(false); setEventFormOpen(true) }}
            />
          </div>
        </div>
      </BottomSheet>

      <LinkReimbursementSheet
        open={reimbursePickerOpen}
        onClose={() => setReimbursePickerOpen(false)}
        state={state}
        editingId={editingTx?.id ?? null}
        onPick={targetId => setEditForm(f => f && ({ ...f, reimbursement_for: targetId }))}
      />

      <EventFormSheet
        open={eventFormOpen}
        onClose={() => setEventFormOpen(false)}
        state={state}
        onAddCategory={onAddCategory}
        onSave={async form => {
          const created = await onAddEvent(form)
          // Attach immediately — the whole point of creating from here is that
          // this transaction belongs to the event you just named.
          if (created) setEditForm(f => f ? { ...f, event_id: created.id } : f)
        }}
      />

      {/* Borrowing-linked delete confirmation */}
      {borrowingDeleteTarget && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={() => setBorrowingDeleteTarget(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
          <div style={{ position: 'relative', background: c.bg, borderRadius: 20, padding: 24, width: '100%', maxWidth: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <div style={{ font: '800 17px Plus Jakarta Sans', color: c.ink, marginBottom: 8 }}>Borrowing-linked transaction</div>
            <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, lineHeight: 1.6, marginBottom: 20 }}>
              This transaction is linked to a borrowing entry. Do you want to also reverse it in the borrowing tracker?
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={() => doDeleteWithBorrowingChoice(borrowingDeleteTarget, true)}
                style={{ width: '100%', background: c.bad, color: '#fff', border: 'none', borderRadius: 12, padding: '13px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}
              >
                Delete + reverse in tracker
              </button>
              <button
                onClick={() => doDeleteWithBorrowingChoice(borrowingDeleteTarget, false)}
                style={{ width: '100%', background: c.surface2, color: c.muted, border: 'none', borderRadius: 12, padding: '13px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}
              >
                Delete transaction only
              </button>
              <button
                onClick={() => setBorrowingDeleteTarget(null)}
                style={{ width: '100%', background: 'none', color: c.muted, border: 'none', borderRadius: 12, padding: '8px', font: '600 13px Plus Jakarta Sans', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {/* Savings-linked delete confirmation */}
      {savingsDeleteTarget && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={() => setSavingsDeleteTarget(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
          <div style={{ position: 'relative', background: c.bg, borderRadius: 20, padding: 24, width: '100%', maxWidth: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <div style={{ font: '800 17px Plus Jakarta Sans', color: c.ink, marginBottom: 8 }}>Savings-linked transaction</div>
            <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, lineHeight: 1.6, marginBottom: 6 }}>
              This transaction is linked to the investment <strong style={{ color: c.ink }}>{savingsDeleteTarget.description}</strong>.
            </div>
            <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 20, font: '600 12px Plus Jakarta Sans', color: '#B45309', lineHeight: 1.5 }}>
              Deleting this transaction will restore your account balance. Do you also want to remove the savings record?
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={() => doDeleteWithSavingsChoice(savingsDeleteTarget, true)}
                style={{ width: '100%', background: '#EF4444', color: '#fff', border: 'none', borderRadius: 12, padding: '13px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}
              >
                Delete transaction + remove savings
              </button>
              <button
                onClick={() => doDeleteWithSavingsChoice(savingsDeleteTarget, false)}
                style={{ width: '100%', background: c.surface2, color: c.ink, border: `1.5px solid ${c.faint}`, borderRadius: 12, padding: '13px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}
              >
                Delete transaction only
              </button>
              <button
                onClick={() => setSavingsDeleteTarget(null)}
                style={{ width: '100%', background: 'none', color: c.muted, border: 'none', borderRadius: 12, padding: '8px', font: '600 13px Plus Jakarta Sans', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Deleting one leg of a split, reached from the account-filtered view where the
          legs are shown separately. Both outcomes act, so this is a choice sheet
          rather than a confirm dialog. */}
      {splitLegDeleteTarget && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={() => setSplitLegDeleteTarget(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
          <div style={{ position: 'relative', background: c.bg, borderRadius: 20, padding: 24, width: '100%', maxWidth: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <div style={{ font: '800 17px Plus Jakarta Sans', color: c.ink, marginBottom: 8 }}>Part of a split payment</div>
            <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, lineHeight: 1.6, marginBottom: 20 }}>
              <strong style={{ color: c.ink }}>{splitLegDeleteTarget.leg.description}</strong> was paid
              from {splitLegDeleteTarget.groupSize} accounts, {fmt(splitLegDeleteTarget.groupTotal)} in total.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={() => doDeleteSplitLeg(splitLegDeleteTarget.leg, false)}
                style={{ width: '100%', background: c.surface2, color: c.ink, border: `1.5px solid ${c.faint}`, borderRadius: 12, padding: '13px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}
              >
                Delete just this {fmt(splitLegDeleteTarget.leg.amount)} payment
              </button>
              <button
                onClick={() => doDeleteSplitLeg(splitLegDeleteTarget.leg, true)}
                style={{ width: '100%', background: '#EF4444', color: '#fff', border: 'none', borderRadius: 12, padding: '13px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}
              >
                Delete the whole {fmt(splitLegDeleteTarget.groupTotal)} split
              </button>
              <button
                onClick={() => setSplitLegDeleteTarget(null)}
                style={{ width: '100%', background: 'none', color: c.muted, border: 'none', borderRadius: 12, padding: '8px', font: '600 13px Plus Jakarta Sans', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {dialogNode}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  const c = useTheme()
  return (
    <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
      {children}
    </div>
  )
}

function EventChip({ label, icon, active, onClick }: { label: string; icon?: string | null; active: boolean; onClick: () => void }) {
  const c = useTheme()
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: `1.5px solid ${active ? c.accent : c.faint}`,
        background: active ? c.accentSoft : 'transparent',
        color: active ? c.accent : c.muted,
        borderRadius: 99, padding: '6px 12px',
        font: '700 12px Plus Jakarta Sans', cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', gap: 5,
      }}
    >
      {icon && <EventIcon name={icon} size={13} color="currentColor" />}
      {label}
    </button>
  )
}

function EventPickerRow({ label, icon, selected, accent, onClick }: {
  label: string; icon?: string | null; selected?: boolean; accent?: boolean; onClick: () => void
}) {
  const c = useTheme()
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
        padding: '13px 12px', borderRadius: 12, border: 'none', cursor: 'pointer',
        background: selected ? c.accentSoft : 'transparent',
        color: accent ? c.accent : c.ink,
        font: `${accent || selected ? 700 : 600} 14px Plus Jakarta Sans`,
        textAlign: 'left',
      }}
    >
      {icon && <EventIcon name={icon} size={16} color="currentColor" />}
      <span style={{ flex: 1 }}>{label}</span>
      {selected && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      )}
    </button>
  )
}
