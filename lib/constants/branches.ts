type BranchSeed = {
  code: "ABRYL" | "TEZONCO" | "ECOMM" | "MIRASOL" | "LUISREY" | "ABRIL";
  name: string;
  legacyStoreId: string;
  legacyStoreName: string;
  isActive?: boolean; // omitido = activa (true); solo las muertas lo ponen en false
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
  {
    code: "MIRASOL",
    name: "Mirasol",
    legacyStoreId: "4",
    legacyStoreName: "Mirasol",
  },
  {
    code: "LUISREY",
    name: "Luis Rey",
    legacyStoreId: "3",
    legacyStoreName: "Luis Rey",
    isActive: false,
  },
  {
    code: "ABRIL",
    name: "Abril",
    legacyStoreId: "9",
    legacyStoreName: "Tiendas De Ropa Y Calzado Abril S.A. De C.V.",
    isActive: false,
  },
];
