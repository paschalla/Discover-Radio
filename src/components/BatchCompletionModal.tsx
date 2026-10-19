import React, { useState } from 'react';
import {
  Bell,
  CheckCircle2,
  Clock,
  History,
  Loader2,
  RefreshCw,
  Shuffle,
  Sparkles,
  X,
} from 'lucide-react';

interface BatchCompletionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTriggerBatch: () => Promise<void>;
  onReplayShuffle: () => void;
  onOpenHistory: () => void;
  totalListenedCount: number;
  isBatchTriggering: boolean;
}

export const BatchCompletionModal: React.FC<BatchCompletionModalProps> = ({
  isOpen,
  onClose,
  onTriggerBatch,
  onReplayShuffle,
  onOpenHistory,
  totalListenedCount,
  isBatchTriggering,
}) => {
  const [notificationStatus, setNotificationStatus] = useState<string>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'unsupported';
  });

  if (!isOpen) return null;

  const handleRequestNotification = async () => {
    if ('Notification' in window) {
      try {
        const perm = await Notification.requestPermission();
        setNotificationStatus(perm);
        if (perm === 'granted') {
          new Notification('Discover Radio Notifications Enabled', {
            body: "You'll be notified whenever all unread episodes finish playing.",
            icon: '/icon.svg',
          });
        }
      } catch (err) {
        console.warn('Failed to request notification permission:', err);
      }
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="completion-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-lg bg-[#13161C] border border-[#222631] rounded-2xl shadow-2xl p-6 sm:p-7 space-y-6">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close dialog"
          className="absolute top-4 right-4 p-1.5 rounded-lg text-[#9CA3AF] hover:text-[#F3F4F6] hover:bg-[#1E2330] transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Icon & Title */}
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-950/80 border border-emerald-700/50 flex items-center justify-center text-emerald-400 shrink-0">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
                Queue Completed
              </span>
              <span className="text-xs text-[#9CA3AF]">
                {totalListenedCount} {totalListenedCount === 1 ? 'story' : 'stories'} finished
              </span>
            </div>
            <h2
              id="completion-modal-title"
              className="text-xl sm:text-2xl font-bold text-[#F3F4F6] mt-1 tracking-tight"
            >
              You're all caught up!
            </h2>
            <p className="text-sm text-[#9CA3AF] mt-1 leading-relaxed">
              Playback stopped because there are no more unread episodes in your feed.
              Would you like to fetch a new batch of stories now?
            </p>
          </div>
        </div>

        {/* Action Offers */}
        <div className="space-y-3 pt-2 border-t border-[#222631]">
          {/* Primary Action: Trigger New Batch */}
          <button
            type="button"
            onClick={async () => {
              await onTriggerBatch();
              onClose();
            }}
            disabled={isBatchTriggering}
            className="w-full py-3 px-4 rounded-xl bg-[var(--accent)] hover:opacity-95 text-[#0B0D11] font-bold text-sm flex items-center justify-center gap-2 transition-opacity cursor-pointer shadow-md disabled:opacity-50"
          >
            {isBatchTriggering ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Polling Feeds &amp; Ingesting Batch...</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                <span>Immediately Ingest New Stories Batch</span>
              </>
            )}
          </button>

          {/* Secondary Action: Replay on Shuffle */}
          <button
            type="button"
            onClick={() => {
              onReplayShuffle();
              onClose();
            }}
            className="w-full py-2.5 px-4 rounded-xl bg-[#0B0D11] hover:bg-[#1A1F2B] border border-[#222631] text-[#F3F4F6] font-medium text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Shuffle className="w-4 h-4 text-[var(--accent)]" />
            <span>Replay Previously Listened Stories (Shuffle)</span>
          </button>

          {/* Tertiary Action: Open Listening History */}
          <button
            type="button"
            onClick={() => {
              onOpenHistory();
              onClose();
            }}
            className="w-full py-2 px-4 rounded-xl text-xs font-mono text-[#9CA3AF] hover:text-[#F3F4F6] hover:bg-[#1A1F2B]/50 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <History className="w-3.5 h-3.5" />
            <span>View Recent Listening History &amp; Timestamps</span>
          </button>
        </div>

        {/* Optional Notification Opt-in */}
        {notificationStatus !== 'unsupported' && (
          <div className="bg-[#0B0D11] border border-[#222631] rounded-xl p-3 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-[#9CA3AF]">
              <Bell className="w-4 h-4 text-[var(--accent)] shrink-0" />
              <span>
                {notificationStatus === 'granted'
                  ? 'Queue completion notifications active'
                  : 'Get notified when your queue finishes'}
              </span>
            </div>
            {notificationStatus !== 'granted' && (
              <button
                type="button"
                onClick={handleRequestNotification}
                className="px-2.5 py-1 rounded bg-[#1E2330] hover:bg-[#282F40] text-[var(--accent)] font-medium text-xs transition-colors shrink-0 cursor-pointer"
              >
                Enable
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
