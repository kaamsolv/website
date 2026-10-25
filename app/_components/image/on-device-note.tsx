/** "Processed on your device" reassurance shared by in-browser tools. */
const BODY = {
  image: 'Your image isn’t uploaded to KaamSolv.',
  text: 'Your text isn’t sent to KaamSolv or saved anywhere.',
  files: 'Files stay on your device — nothing is uploaded to KaamSolv.',
};

export function OnDeviceNote({ subject = 'image' }: { subject?: keyof typeof BODY }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-teal-300 bg-tealx-100 p-4">
      <svg
        className="mt-0.5 h-5 w-5 shrink-0 text-tealx-600"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
      <div>
        <p className="text-sm font-semibold text-ink">Processed on your device</p>
        <p className="text-sm text-strong">
          {BODY[subject]}
        </p>
      </div>
    </div>
  );
}
