export default function PtMark({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  const s = size === 'lg' ? 'h-14 w-14 rounded-[10px] text-[22px]' : 'h-8 w-8 rounded-md text-[15px]'
  return (
    <div className={`flex shrink-0 items-center justify-center border-[1.5px] border-gold bg-gradient-to-br from-royal to-royal-dark font-extrabold text-gold ${s}`}>
      PT
    </div>
  )
}
