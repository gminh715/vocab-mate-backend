export const appConfig = () => ({
  port: Number(process.env.PORT ?? 3000),
});

export type ReturnTypeOfAppConfig = ReturnType<typeof appConfig>;
