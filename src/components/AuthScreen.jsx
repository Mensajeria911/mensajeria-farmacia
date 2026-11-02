import { useState } from 'react';
import { Icon } from './Icon.jsx';

export function AuthScreen({ configured, onSignIn }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [accessMode, setAccessMode] = useState('pharmacy');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    if (!identifier.trim() || password.length < 6) {
      setError('Escribe tu usuario y una clave de al menos 6 caracteres.');
      return;
    }
    setLoading(true);
    const result = await onSignIn(identifier, password);
    if (result?.error) setError('No pudimos abrir la sesión. Revisa los datos o pide a la central que habilite tu cuenta.');
    setLoading(false);
  }

  return (
    <main className="auth-screen auth-screen--deepseek">
      <div className="auth-login-shell">
        <header className="deep-login-top"><div className="deep-login-brand"><img src={`${import.meta.env.BASE_URL}assets/farmanortedromedicas_logo.jpg`} alt="farmanorte droguerías" /><span>farmanorte droguerías</span></div><span className="deep-login-city"><i />Montería</span></header>
        <div className="deep-login-copy"><span className="deep-login-kicker">Operación farmanorte</span><h1>Tu turno empieza<br />aquí.</h1><p>Consulta tus domicilios, habla con la farmacia y cierra cada entrega desde un solo lugar.</p></div>
        <section className="deep-login-card" aria-labelledby="login-title">
          <h2 id="login-title">Ingresa a tu turno</h2>
          <div className="deep-login-modes" role="tablist" aria-label="Tipo de acceso"><button type="button" role="tab" aria-selected={accessMode === 'pharmacy'} className={accessMode === 'pharmacy' ? 'is-active' : ''} onClick={() => setAccessMode('pharmacy')}><Icon name="store" size={16} />Farmacia</button><button type="button" role="tab" aria-selected={accessMode === 'admin'} className={accessMode === 'admin' ? 'is-active' : ''} onClick={() => setAccessMode('admin')}><Icon name="users" size={16} />Administrador</button></div>
          {!configured && <div className="deep-login-error" role="alert"><Icon name="close" size={16} />Falta configurar Supabase en este entorno.</div>}
          <form onSubmit={handleSubmit} noValidate>
            <label className="deep-login-field" htmlFor="pharmacy-identifier"><span className="sr-only">Usuario</span><span className="deep-login-field-icon"><Icon name="user" size={20} /></span><input id="pharmacy-identifier" value={identifier} onChange={event => setIdentifier(event.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))} placeholder="Usuario" autoComplete="username" autoCapitalize="none" spellCheck={false} disabled={!configured || loading} /></label>
            <label className="deep-login-field" htmlFor="pharmacy-password"><span className="sr-only">Contraseña</span><span className="deep-login-field-icon"><Icon name="lock" size={20} /></span><input id="pharmacy-password" value={password} onChange={event => setPassword(event.target.value)} type={showPassword ? 'text' : 'password'} placeholder="Contraseña" autoComplete="current-password" disabled={!configured || loading} /><button className="deep-login-password-toggle" type="button" aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} onClick={() => setShowPassword(value => !value)} disabled={!configured || loading}><Icon name={showPassword ? 'eye-off' : 'eye'} size={20} /></button></label>
            <div className="deep-login-session"><Icon name="shield" size={14} /><span>Tu sesión queda abierta en este navegador hasta que cierres sesión.</span></div>
            {error && <div className="deep-login-error" role="alert"><Icon name="close" size={16} />{error}</div>}
            <button className="deep-login-submit" type="submit" disabled={!configured || loading}>{loading ? 'Entrando…' : 'Entrar'}<Icon name="arrow" size={18} /></button>
          </form>
        </section>
        <div className="deep-login-route-art" aria-hidden="true"><span className="route-orbit route-orbit--one" /><span className="route-orbit route-orbit--two" /><span className="route-path" /><span className="route-dot route-dot--one" /><span className="route-dot route-dot--two" /><span className="route-dot route-dot--three" /></div>
        <footer className="deep-login-foot">Mensajería para <strong>farmanorte</strong> · Operación Montería</footer>
      </div>
    </main>
  );
}
