/** Keyboard-only "Skip to main content" link -- invisible until focused (Tab from the
    address bar), then lets a screen-reader/keyboard user jump past the nav chrome straight
    to the page content instead of tabbing through every nav item first. */
export function SkipToContent({ targetId = 'main-content' }: { targetId?: string }) {
  return (
    <a
      href={`#${targetId}`}
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-ember-500 focus:px-4 focus:py-2.5 focus:text-sm focus:font-bold focus:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-court-cream focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
    >
      Skip to main content
    </a>
  )
}
