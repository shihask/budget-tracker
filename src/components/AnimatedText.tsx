import { useEffect, useRef, useState } from 'react'

interface Props {
  text: string
  speed?: number   // ms per reveal tick, default ~18
  charsPerTick?: number
  onDone?: () => void
}

// Small, reusable character-reveal component — no blinking cursor (reads as gimmicky on
// repeat viewings), no networking, no coupling to Mint or Coach. Takes a plain string
// that's already fully received; reusable later for achievement celebrations, reflection
// summaries, or any other AI-generated text surface.
export function AnimatedText({ text, speed = 18, charsPerTick = 2, onDone }: Props) {
  const [shown, setShown] = useState(0)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  useEffect(() => {
    setShown(0)
    if (!text) return
    const id = setInterval(() => {
      setShown(prev => {
        const next = Math.min(text.length, prev + charsPerTick)
        if (next >= text.length) {
          clearInterval(id)
          onDoneRef.current?.()
        }
        return next
      })
    }, speed)
    return () => clearInterval(id)
  }, [text, speed, charsPerTick])

  return <>{text.slice(0, shown)}</>
}
