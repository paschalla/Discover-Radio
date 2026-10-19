import React from 'react';
import { Plus } from 'lucide-react';

export type ActiveTab = 'feed' | 'vault' | 'bridges' | 'tune';

interface TopBarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  onOpenCustomModal: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  onSelectTab,
  onOpenCustomModal,
}) => {
  const navItems: Array<{ id: ActiveTab; label: string }> = [
    { id: 'feed', label: 'Feed' },
    { id: 'vault', label: 'RAG Vault' },
    { id: 'bridges', label: 'Bridges & RSS' },
    { id: 'tune', label: 'Tune' },
  ];

  return (
    <header className="sticky top-0 z-30 bg-[#0B0D11]/90 backdrop-blur-md border-b border-[#222631] px-4 sm:px-6 h-14 flex items-center justify-between gap-8">
      {/* Zone 1: Brand Wordmark (Single text element, one line) */}
      <a
        href="#feed"
        onClick={(e) => {
          e.preventDefault();
          onSelectTab('feed');
        }}
        className="font-display text-base sm:text-lg font-bold tracking-tight text-[#F3F4F6] whitespace-nowrap shrink-0"
      >
        Discover Radio
      </a>

      {/* Zone 2: 4 Clean Single-Line Text Navigation Links */}
      <nav className="flex items-center gap-4 sm:gap-7 text-xs sm:text-sm font-medium text-[#9CA3AF] overflow-x-auto no-scrollbar">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`py-4 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isActive
                  ? 'border-[var(--accent)] text-[#F3F4F6] font-semibold'
                  : 'border-transparent text-[#9CA3AF] hover:text-[#F3F4F6]'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: 1 Primary Action Button */}
      <div className="flex items-center shrink-0">
        <button
          type="button"
          onClick={onOpenCustomModal}
          className="px-3.5 py-2 rounded-lg text-xs font-semibold text-[#0B0D11] bg-[var(--accent)] hover:opacity-90 transition-opacity flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer min-h-[38px]"
        >
          <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>Custom Ingest</span>
        </button>
      </div>
    </header>
  );
};
