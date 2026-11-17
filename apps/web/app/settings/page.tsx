import { redirect } from 'next/navigation';

// The settings have one page for now: the AI provider.
export default function SettingsPage() {
  redirect('/settings/ai');
}
