type BranchSeed = {
  code: "ABRYL" | "TEZONCO" | "ECOMM";
  name: string;
  legacyStoreId: string;
  legacyStoreName: string;
};

export const BRANCHES: ReadonlyArray<BranchSeed> = [
  {
    code: "ABRYL",
    name: "Abryl",
    legacyStoreId: "1",
    legacyStoreName: "Adrian Granados Del Llano",
  },
  {
    code: "TEZONCO",
    name: "Tezonco",
    legacyStoreId: "2",
    legacyStoreName: "Carlos Del Llano Robles",
  },
  {
    code: "ECOMM",
    name: "e-commerce",
    legacyStoreId: "5",
    legacyStoreName: "Sport Tenis",
  },
];
