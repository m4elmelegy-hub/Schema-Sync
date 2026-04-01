import { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, X } from "lucide-react";

function normalizeName(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .toLowerCase();
}

export interface SelectItem {
  value: string;
  label: string;
  searchKeys: string[];
  group?: string;
}

interface Props {
  items: SelectItem[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyLabel?: string;
  className?: string;
  inputClassName?: string;
  clearable?: boolean;
}

export function SearchableSelect({
  items,
  value,
  onChange,
  placeholder = "ابحث باسم أو كود...",
  emptyLabel,
  className,
  inputClassName,
  clearable = true,
}: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [dropPos, setDropPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = items.find((i) => i.value === value);

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = normalizeName(query);
    const numQ = query.trim().replace(/\D/g, "");
    return items.filter((item) =>
      item.searchKeys.some((k) => {
        const nk = normalizeName(k);
        if (nk.includes(q)) return true;
        if (numQ && k.replace(/\D/g, "").startsWith(numQ)) return true;
        return false;
      })
    );
  }, [query, items]);

  const openDropdown = () => {
    if (!inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    setDropPos({
      top: rect.bottom + window.scrollY + 4,
      left: rect.left + window.scrollX,
      width: Math.max(rect.width, 200),
    });
    setOpen(true);
  };

  const closeDropdown = () => {
    setOpen(false);
    setQuery("");
  };

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target)) return;
      const drop = document.getElementById("ss-dropdown-portal");
      if (drop?.contains(target)) return;
      closeDropdown();
    };
    const onScroll = () => {
      if (open && inputRef.current) {
        const rect = inputRef.current.getBoundingClientRect();
        setDropPos((prev) =>
          prev ? { ...prev, top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX } : null
        );
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  const handleSelect = (item: SelectItem) => {
    onChange(item.value);
    closeDropdown();
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
    closeDropdown();
  };

  const displayValue = open ? query : selected ? selected.label : emptyLabel ?? "";

  const dropdown =
    open && dropPos
      ? createPortal(
          <div
            id="ss-dropdown-portal"
            style={{
              position: "absolute",
              top: dropPos.top,
              left: dropPos.left,
              width: dropPos.width,
              zIndex: 9999,
            }}
            className="bg-slate-900 border border-white/15 rounded-xl shadow-2xl max-h-64 overflow-y-auto"
          >
            {emptyLabel && (
              <button
                type="button"
                className="w-full text-right px-3 py-2 text-sm text-white/40 hover:bg-white/5 border-b border-white/5 block"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange("");
                  closeDropdown();
                }}
              >
                {emptyLabel}
              </button>
            )}
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-center text-white/30 text-sm">لا توجد نتائج</div>
            ) : (
              (() => {
                let lastGroup = "";
                return filtered.map((item) => {
                  const showGroup = item.group && item.group !== lastGroup;
                  if (showGroup) lastGroup = item.group!;
                  return (
                    <div key={item.value}>
                      {showGroup && (
                        <div className="px-3 py-1 text-xs text-white/30 bg-white/5 border-b border-white/5 sticky top-0">
                          {item.group}
                        </div>
                      )}
                      <button
                        type="button"
                        className={`w-full text-right px-3 py-2 text-sm hover:bg-white/10 transition-colors block ${
                          value === item.value ? "bg-amber-500/10 text-amber-300" : "text-white"
                        }`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelect(item);
                        }}
                      >
                        {item.label}
                      </button>
                    </div>
                  );
                });
              })()
            )}
          </div>,
          document.body
        )
      : null;

  return (
    <div ref={wrapRef} className={`relative ${className ?? ""}`}>
      <div
        className={`flex items-center gap-1 cursor-text ${inputClassName ?? "glass-input w-full"}`}
        onClick={() => {
          inputRef.current?.focus();
          openDropdown();
        }}
      >
        <input
          ref={inputRef}
          type="text"
          className="bg-transparent text-white outline-none flex-1 min-w-0 placeholder:text-white/30"
          placeholder={open ? placeholder : placeholder}
          value={displayValue}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) openDropdown();
          }}
          onFocus={() => openDropdown()}
          onKeyDown={(e) => {
            if (e.key === "Escape") closeDropdown();
            if (e.key === "Enter" && filtered.length > 0) {
              e.preventDefault();
              handleSelect(filtered[0]);
            }
          }}
        />
        {clearable && value && !open ? (
          <button type="button" onClick={handleClear} className="text-white/30 hover:text-white/60 shrink-0 p-0.5">
            <X className="w-3 h-3" />
          </button>
        ) : (
          <ChevronDown
            className={`w-3 h-3 text-white/30 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          />
        )}
      </div>
      {dropdown}
    </div>
  );
}
