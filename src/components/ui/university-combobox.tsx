"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type UniversityRecord = { n: string; c: "US" | "CA"; s: string | null };

const MAX_RESULTS = 60;

let universityCache: UniversityRecord[] | null = null;

async function loadUniversities(): Promise<UniversityRecord[]> {
  if (universityCache) return universityCache;
  const data = (await import("@/lib/data/universities-us-ca.json"))
    .default as UniversityRecord[];
  universityCache = data;
  return data;
}

/**
 * Searchable picker over every accredited US and Canadian institution
 * (2,489 entries, lazily loaded). Filters by typed text, scoped to the
 * selected country of study, with an always-available "Other" escape hatch.
 */
export function UniversityCombobox({
  label = "School / university",
  country,
  value,
  onChange,
}: {
  label?: string;
  country: string; // "United States" | "Canada" | ""
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [universities, setUniversities] = useState<UniversityRecord[]>([]);

  useEffect(() => {
    let active = true;
    loadUniversities().then((data) => {
      if (active) setUniversities(data);
    });
    return () => {
      active = false;
    };
  }, []);

  const countryCode =
    country === "United States" ? "US" : country === "Canada" ? "CA" : null;

  const results = useMemo(() => {
    const scoped = countryCode
      ? universities.filter((u) => u.c === countryCode)
      : universities;
    const q = query.trim().toLowerCase();
    if (!q) return scoped.slice(0, MAX_RESULTS);
    const startsWith: UniversityRecord[] = [];
    const contains: UniversityRecord[] = [];
    for (const u of scoped) {
      const name = u.n.toLowerCase();
      if (name.startsWith(q)) startsWith.push(u);
      else if (name.includes(q)) contains.push(u);
      if (startsWith.length >= MAX_RESULTS) break;
    }
    return [...startsWith, ...contains].slice(0, MAX_RESULTS);
  }, [universities, countryCode, query]);

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            className="h-10 w-full justify-between font-normal"
          >
            <span className="truncate">
              {value || (country ? "Search your school" : "Select country first")}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
          <Command shouldFilter={false}>
            <div className="border-b border-neutral-100 p-2 dark:border-neutral-800">
              <Input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Type to search 2,400+ schools"
                className="h-9"
              />
            </div>
            <CommandList>
              <CommandEmpty>No school found. Choose Other below.</CommandEmpty>
              <CommandGroup>
                {results.map((u) => (
                  <CommandItem
                    key={u.n}
                    value={u.n}
                    onSelect={() => {
                      onChange(u.n);
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4 shrink-0",
                        value === u.n ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <span className="truncate">{u.n}</span>
                    {u.s && (
                      <span className="ml-auto pl-2 text-xs text-neutral-500">
                        {u.s}
                      </span>
                    )}
                  </CommandItem>
                ))}
                <CommandItem
                  value="__other__"
                  onSelect={() => {
                    onChange("Other");
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 shrink-0",
                      value === "Other" ? "opacity-100" : "opacity-0"
                    )}
                  />
                  Other (enter manually)
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
