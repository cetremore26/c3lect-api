export const envConfig = () => ({
  port:        parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv:     process.env.NODE_ENV ?? 'development',
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  jwt: {
    secret:             process.env.JWT_SECRET ?? 'dev-secret',
    expiresIn:          process.env.JWT_EXPIRES_IN ?? '15m',
    refreshExpiresIn:   process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
});
