import { createContext, useContext, useState, ReactNode } from "react";

interface WarehouseContextType {
  currentWarehouseId: string;
  setWarehouseId: (id: string) => void;
}

const WarehouseContext = createContext<WarehouseContextType>({
  currentWarehouseId: "",
  setWarehouseId: () => {},
});

const STORAGE_KEY = "erp_current_warehouse_id";

export function WarehouseProvider({ children }: { children: ReactNode }) {
  const [currentWarehouseId, setCurrentWarehouseId] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) ?? "";
    } catch {
      return "";
    }
  });

  const setWarehouseId = (id: string) => {
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch { /* silent */ }
    setCurrentWarehouseId(id);
  };

  return (
    <WarehouseContext.Provider value={{ currentWarehouseId, setWarehouseId }}>
      {children}
    </WarehouseContext.Provider>
  );
}

export function useWarehouse() {
  return useContext(WarehouseContext);
}
