-- Normaliza los emails de users a minúsculas y sin espacios.
-- Aborta si dos cuentas colisionan al normalizar, para resolverlo a mano.
DO $$
DECLARE
  duplicados text;
BEGIN
  SELECT string_agg(correo, ', ')
    INTO duplicados
    FROM (
      SELECT lower(trim(email)) AS correo
        FROM users
       GROUP BY 1
      HAVING count(*) > 1
    ) d;

  IF duplicados IS NOT NULL THEN
    RAISE EXCEPTION 'Emails duplicados sin distinguir mayúsculas en users: %', duplicados;
  END IF;

  UPDATE users SET email = lower(trim(email)) WHERE email <> lower(trim(email));
END $$;
