export const cx = (...v: (string | false | null | undefined)[]): string => v.filter(Boolean).join(' ')
