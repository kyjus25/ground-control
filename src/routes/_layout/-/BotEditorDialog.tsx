import { Dialog } from '../../../shared/Dialog'
import BotEditorForm from '../../../shared/BotEditorForm'
import type { Bot } from '../../../types/bot'

// Thin dialog wrapper around the shared editor form. Lazily loaded from the
// Navigation; the shared form is reused by the onboarding page.
export default function BotEditorDialog(props: {
  bot: Bot | null
  onClose: () => void
}) {
  return (
    <Dialog
      open
      onClose={props.onClose}
      title={props.bot ? 'Edit bot' : 'New bot'}
      description="Identity, soul, and skills."
      class="max-w-lg"
      closeOnBackdrop={false}
    >
      <BotEditorForm bot={props.bot} onDone={props.onClose} allowDelete={!!props.bot} />
    </Dialog>
  )
}
