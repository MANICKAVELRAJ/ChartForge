declare module "*.json" {
  const value: {
    id: number;
    name: string;
    type: string;
    color?: string;      // for bar/column
    colors?: string[];   // for stacked charts
  }[];
  export default value;
}
