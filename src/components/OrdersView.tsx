import { FileSpreadsheet, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fmtNum, fmtYenShort } from '../domain/format'
import { isOrderCodeTaken, normalizeOrderCode, ordersOfProject } from '../domain/orders'
import { useApp } from '../store/AppContext'
import { Card } from './Card'
import { CommitField } from './CommitField'
import { ConfirmDialog } from './ConfirmDialog'
import { useToast } from './Toast'
import { cx } from './cx'

/** プロジェクトの「社内オーダー」タブ。作業時間・人件費の計上先（オーダー番号）を登録する */
export function OrdersView({ projectId }: { projectId: string }) {
  const { data, derived, actions, can } = useApp()
  const { toast } = useToast()
  const project = derived.projectById.get(projectId)
  const editable = can('order.edit', { project })
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [assignTo, setAssignTo] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)

  const orders = useMemo(() => ordersOfProject(data.internalOrders, projectId), [data.internalOrders, projectId])
  const entries = useMemo(() => data.timeEntries.filter((e) => e.projectId === projectId), [data.timeEntries, projectId])
  const stats = useMemo(() => {
    const m = new Map<string | null, { hours: number; cost: number; count: number }>()
    for (const e of entries) {
      const k = e.orderId ?? null
      const cur = m.get(k) ?? { hours: 0, cost: 0, count: 0 }
      cur.hours += e.hours
      cur.cost += e.hours * derived.rateOf(e.userId)
      cur.count += 1
      m.set(k, cur)
    }
    return m
  }, [entries, derived])
  const taskCount = (orderId: string) => data.wbs.filter((w) => w.orderId === orderId).length
  const unsetTasks = derived.leaves.filter((l) => l.projectId === projectId && l.type !== 'milestone' && !l.orderId).length
  const unset = stats.get(null)
  const activeOrders = orders.filter((o) => o.status === 'active')

  if (!project) return null

  const dup = code.trim() !== '' && isOrderCodeTaken(data.internalOrders, code)
  const add = () => {
    if (!code.trim() || dup) return
    actions.addOrder({ projectId, code: normalizeOrderCode(code), name: name.trim() || project.name, status: 'active', note: note.trim() || undefined })
    toast(<><strong>{normalizeOrderCode(code)}</strong> を登録しました</>)
    setCode('')
    setName('')
    setNote('')
  }
  const target = orders.find((o) => o.id === deleting)

  return (
    <div className="ov">
      <div className="ov__main">
        <Card
          title="社内オーダー"
          subtitle="作業時間・人件費の計上先（内部オーダー番号）。作業ごとに設定でき、「自分の作業」で時間を入力すると、そのオーダーに計上されます"
          action={
            <Link className="link-btn" to={`/reports?project=${projectId}`}>
              <FileSpreadsheet size={13} /> 締めのレポート（CSV）へ
            </Link>
          }
          flush
        >
          {orders.length === 0 ? (
            <div className="empty">社内オーダーがまだ登録されていません。{editable && '下のフォームから登録してください。'}</div>
          ) : (
            <div className="admtable" role="table" aria-label="社内オーダー一覧">
              <div className="admtable__row admtable__row--head ord-cols" role="row">
                <span>オーダー番号</span>
                <span>名称</span>
                <span>状態</span>
                <span className="num">作業時間 / 人件費</span>
                <span />
              </div>
              {orders.map((o) => {
                const st = stats.get(o.id)
                const used = (st?.count ?? 0) > 0 || taskCount(o.id) > 0
                return (
                  <div key={o.id} className={cx('admtable__row ord-cols', o.status === 'closed' && 'is-closed')} role="row">
                    {editable ? (
                      <CommitField
                        className="input input--sm ord__code"
                        value={o.code}
                        aria-label="オーダー番号"
                        onCommit={(v) => {
                          const next = normalizeOrderCode(v)
                          if (!next) return
                          if (isOrderCodeTaken(data.internalOrders, next, o.id)) return toast('同じ番号のオーダーが既にあります', 'info')
                          actions.updateOrder(o.id, { code: next })
                        }}
                      />
                    ) : (
                      <b className="ord__code-ro">{o.code}</b>
                    )}
                    <span className="ord__name">
                      {editable ? (
                        <CommitField className="input input--sm" value={o.name} aria-label="オーダー名" onCommit={(v) => v.trim() && actions.updateOrder(o.id, { name: v.trim() })} />
                      ) : (
                        o.name
                      )}
                      {o.note && <small>{o.note}</small>}
                    </span>
                    <span>
                      <span className={cx('chip', o.status === 'active' ? 'chip--soft' : 'chip--warn')}>{o.status === 'active' ? '使用中' : '終了'}</span>
                    </span>
                    <span className="num ord__sum" title={`累計。このオーダーの作業 ${taskCount(o.id)}件`}>
                      <b>{fmtNum(st?.hours ?? 0)}h</b>
                      <small>{fmtYenShort(st?.cost ?? 0)}円・作業{taskCount(o.id)}件</small>
                    </span>
                    <span className="ord__btns">
                      {editable && (
                        <>
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => actions.updateOrder(o.id, { status: o.status === 'active' ? 'closed' : 'active' })}
                            title={o.status === 'active' ? '終了すると、新しい入力では選べなくなります（過去の集計は残ります）' : '再び使えるようにします'}
                          >
                            {o.status === 'active' ? '終了する' : '再開する'}
                          </button>
                          <button
                            type="button"
                            className="icon-btn icon-btn--sm"
                            aria-label={`${o.code}を削除`}
                            title={used ? '作業・作業時間に使われているオーダーは、削除すると「未設定」に戻ります' : '削除'}
                            onClick={() => (used ? setDeleting(o.id) : actions.deleteOrder(o.id))}
                          >
                            <Trash2 size={15} />
                          </button>
                        </>
                      )}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        {editable ? (
          <Card title="社内オーダーを登録" subtitle="オーダー番号は、全プロジェクトで重複しない番号にしてください（英字は大文字にそろえます）">
            <form
              className="admform ord-form"
              onSubmit={(e) => {
                e.preventDefault()
                add()
              }}
            >
              <label className="field">
                <span className="field__label">オーダー番号</span>
                <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="例: IO-2601-003" aria-label="新しいオーダー番号" />
              </label>
              <label className="field">
                <span className="field__label">名称（省略するとプロジェクト名）</span>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={project.name} aria-label="新しいオーダー名" />
              </label>
              <label className="field">
                <span className="field__label">メモ（任意）</span>
                <input className="input" value={note} onChange={(e) => setNote(e.target.value)} aria-label="新しいオーダーのメモ" />
              </label>
              <button type="submit" className="btn btn--primary" disabled={!code.trim() || dup}>
                <Plus size={15} /> 登録
              </button>
            </form>
            {dup && <p className="form__warn">この番号は既に使われています。</p>}
          </Card>
        ) : (
          <p className="hint">社内オーダーの登録・変更は、このプロジェクトのリーダー、または課長以上が行えます。</p>
        )}
      </div>

      <div className="ov__side">
        <Card title="オーダー未設定の実績" subtitle="レポートでは「（未設定）」として集計されます">
          {!unset && unsetTasks === 0 ? (
            <div className="empty">オーダーが設定されていない作業時間・作業はありません</div>
          ) : (
            <>
              <dl className="ov__dl ord-unset">
                <div>
                  <dt>作業時間</dt>
                  <dd>
                    {fmtNum(unset?.hours ?? 0)}h <small>（{unset?.count ?? 0}件）</small>
                  </dd>
                </div>
                <div>
                  <dt>作業（タスク）</dt>
                  <dd>{unsetTasks}件</dd>
                </div>
              </dl>
              {editable && activeOrders.length > 0 ? (
                <div className="ord-assign">
                  <select className="input input--sm" value={assignTo} onChange={(e) => setAssignTo(e.target.value)} aria-label="割り当てるオーダー">
                    <option value="">割り当てるオーダーを選ぶ</option>
                    {activeOrders.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.code} {o.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    disabled={!assignTo}
                    onClick={() => {
                      actions.assignUnsetToOrder(projectId, assignTo)
                      toast('未設定の作業時間・作業を割り当てました')
                      setAssignTo('')
                    }}
                  >
                    まとめて割り当てる
                  </button>
                </div>
              ) : (
                <p className="hint">{activeOrders.length === 0 ? '使用中のオーダーを登録すると、まとめて割り当てられます。' : '割り当ては、リーダー以上が行えます。'}</p>
              )}
              <p className="hint">作業ごとのオーダーは、「一覧」の作業ドロワー（基本）で変更できます。</p>
            </>
          )}
        </Card>

        <Card title="使い方">
          <ol className="howto">
            <li>ここでオーダー番号を登録します（プロジェクトに複数登録できます）。</li>
            <li>作業ドロワーの「社内オーダー」で、作業ごとに計上先を決めます。</li>
            <li>「自分の作業」で時間を入力すると、作業のオーダーに計上されます（変更も可）。</li>
            <li>「レポート」で、15日締め・末締めの集計をCSVで出します。</li>
          </ol>
        </Card>
      </div>

      {deleting && target && (
        <ConfirmDialog
          title={`社内オーダー「${target.code}」を削除しますか？`}
          confirmLabel="削除する"
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            actions.deleteOrder(target.id)
            setDeleting(null)
            toast('削除しました。使われていた作業・作業時間は「オーダー未設定」に戻りました', 'info')
          }}
        >
          このオーダーを使っている作業と作業時間は、削除すると「オーダー未設定」になります。不要になっただけなら「終了する」にすると、過去の集計を残せます。
        </ConfirmDialog>
      )}
    </div>
  )
}
