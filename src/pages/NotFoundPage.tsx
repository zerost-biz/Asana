import { Link } from 'react-router-dom'

export function NotFoundPage({ message = 'ページが見つかりません' }: { message?: string }) {
  return (
    <div className="page">
      <div className="empty empty--big">
        <p>{message}</p>
        <Link to="/" className="btn btn--primary">
          ホームに戻る
        </Link>
      </div>
    </div>
  )
}
