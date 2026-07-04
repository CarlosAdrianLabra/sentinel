"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";

type Props = {
  initialQuery: string;
};

const DEBOUNCE_MS = 300;

export function SearchInput({ initialQuery }: Props) {
  const router = useRouter();
  const [value, setValue] = useState(initialQuery);

  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (value.trim() !== "") {
        params.set("q", value);
      }
      const queryString = params.toString();
      router.push(queryString ? `/inventory?${queryString}` : "/inventory");
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [value, router]);

  return (
    <Input
      type="text"
      placeholder="Buscar por marca, modelo o color..."
      value={value}
      onChange={(e) => setValue(e.target.value)}
      className="max-w-md"
    />
  );
}
