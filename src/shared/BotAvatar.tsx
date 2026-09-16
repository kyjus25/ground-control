import type { Bot, BotColor, BotShape } from '../types/bot'

const SHAPE_CLASS: Record<BotShape, string> = {
  circle: 'rounded-full',
  square: 'rounded-md',
  hex: 'shape-hex',
  triangle: 'shape-tri',
  diamond: 'shape-diamond',
}

export const COLOR_BG: Record<BotColor, string> = {
  green: 'bg-green-100',
  teal: 'bg-teal-100',
  sky: 'bg-sky-100',
  blue: 'bg-blue-100',
  violet: 'bg-violet-100',
  fuchsia: 'bg-fuchsia-100',
  rose: 'bg-rose-100',
  red: 'bg-red-100',
  orange: 'bg-orange-100',
  amber: 'bg-amber-100',
  lime: 'bg-lime-100',
  stone: 'bg-stone-100',
}

// The identity triple (§3.2): emoji + muted pastel color + geometric shape.
export function BotAvatar(props: { bot: Pick<Bot, 'emoji' | 'color' | 'shape'>; class?: string }) {
  return (
    <div
      class={`flex shrink-0 items-center justify-center ${props.class ?? 'h-8 w-8 text-sm'} ${SHAPE_CLASS[props.bot.shape]} ${COLOR_BG[props.bot.color]}`}
    >
      {props.bot.emoji}
    </div>
  )
}
