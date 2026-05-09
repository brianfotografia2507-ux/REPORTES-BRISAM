import Image from "next/image";

type Project = {
  title: string;
  location: string;
  image: string;
};

type Service = {
  title: string;
  description: string;
  icon: IconName;
};

type Benefit = {
  title: string;
  detail: string;
  icon: IconName;
};

type IconName =
  | "tool"
  | "bolt"
  | "drop"
  | "shield"
  | "clock"
  | "report"
  | "building"
  | "app";

const metrics = [
  { value: "24/7", label: "Atencion de emergencias" },
  { value: "+250", label: "Sucursales atendidas" },
  { value: "98%", label: "Cumplimiento de SLA" },
  { value: "+8", label: "Anios de experiencia" }
];

const services: Service[] = [
  {
    title: "Aire Acondicionado",
    description:
      "Mantenimiento preventivo y correctivo para sistemas HVAC comerciales e industriales.",
    icon: "tool"
  },
  {
    title: "Electrico",
    description:
      "Diagnostico, correccion y optimizacion de instalaciones electricas con enfoque en continuidad operativa.",
    icon: "bolt"
  },
  {
    title: "Hidraulico",
    description:
      "Atencion de fugas, redes hidrosanitarias y mantenimiento integral para infraestructura hidraulica.",
    icon: "drop"
  },
  {
    title: "Mantenimiento General",
    description:
      "Programas de mantenimiento integral para mantener tus unidades seguras, limpias y eficientes.",
    icon: "shield"
  },
  {
    title: "Obra y Acabados",
    description:
      "Adecuaciones, remodelaciones y acabados profesionales alineados a la imagen de tu marca.",
    icon: "building"
  },
  {
    title: "Proyectos",
    description:
      "Planeacion y ejecucion llave en mano para proyectos tecnicos con seguimiento y control.",
    icon: "app"
  }
];

const benefits: Benefit[] = [
  {
    title: "Respuesta rapida",
    detail: "Despacho agil para incidencias criticas y atenciones programadas.",
    icon: "clock"
  },
  {
    title: "Tecnicos certificados",
    detail:
      "Personal especializado con protocolos de seguridad y cumplimiento normativo.",
    icon: "shield"
  },
  {
    title: "Calidad garantizada",
    detail: "Procesos estandarizados para asegurar resultados consistentes.",
    icon: "tool"
  },
  {
    title: "Reportes y evidencias",
    detail:
      "Documentacion digital con fotos, checklists y trazabilidad por servicio.",
    icon: "report"
  },
  {
    title: "Soporte 24/7",
    detail: "Acompanamiento continuo para mantener tu operacion siempre activa.",
    icon: "clock"
  }
];

const projects: Project[] = [
  // Reemplaza estas URLs por rutas locales en /public cuando tengas fotos finales.
  {
    title: "Plan maestro de mantenimiento HVAC",
    location: "Monterrey, Nuevo Leon",
    image:
      "https://images.unsplash.com/photo-1581093804475-577d72e38aa0?auto=format&fit=crop&w=1200&q=80"
  },
  {
    title: "Adecuacion electrica para cadena retail",
    location: "Guadalajara, Jalisco",
    image:
      "https://images.unsplash.com/photo-1581093448799-4510b7c4b9f4?auto=format&fit=crop&w=1200&q=80"
  },
  {
    title: "Remodelacion integral de cocina industrial",
    location: "Ciudad de Mexico",
    image:
      "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=1200&q=80"
  }
];

const sectors = [
  "Restaurantes",
  "Retail",
  "Oficinas",
  "Hoteles",
  "Industria",
  "Salud",
  "Mas sectores"
];

const clients = [
  "Pollo Loco",
  "Urban Coffee",
  "Wings Army",
  "Mr. Pampas",
  "Chili's",
  "Sirloin Stockade",
  "La Playa"
];

function Icon({ name }: { name: IconName }) {
  const baseClass = "h-6 w-6";

  switch (name) {
    case "tool":
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className={baseClass}
          aria-hidden="true"
        >
          <path
            d="M13.5 4.5a4.5 4.5 0 0 0 6 6L10 20l-3 1 1-3 9.5-9.5z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "bolt":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={baseClass} aria-hidden="true">
          <path
            d="m13 2-8 11h6l-1 9 9-13h-6l0-7z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "drop":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={baseClass} aria-hidden="true">
          <path
            d="M12 3s6 6.4 6 10.5A6 6 0 1 1 6 13.5C6 9.4 12 3 12 3z"
            stroke="currentColor"
            strokeWidth="1.8"
          />
        </svg>
      );
    case "shield":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={baseClass} aria-hidden="true">
          <path
            d="M12 3 5 6v6c0 4.7 3 7.8 7 9 4-1.2 7-4.3 7-9V6l-7-3z"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <path
            d="m9.5 12 1.8 1.8 3.7-3.8"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "clock":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={baseClass} aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="M12 7.5V12l3 2"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
    case "report":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={baseClass} aria-hidden="true">
          <path d="M7 3h8l4 4v14H7z" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="M15 3v4h4M10 12h6M10 16h6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
    case "building":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={baseClass} aria-hidden="true">
          <path d="M4 21V5l8-2v18M12 9h8v12" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="M7.5 8h1M7.5 12h1M7.5 16h1M15 12h1M15 16h1"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" className={baseClass} aria-hidden="true">
          <rect x="3" y="4" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="M8 21h8M10 17.5h4"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
  }
}

export default function Home() {
  return (
    <div className="bg-white">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-black/85 backdrop-blur">
        <div className="site-container flex h-20 items-center justify-between">
          <a href="#inicio" aria-label="Ir al inicio de BRISAM" className="group">
            <Image
              src="/brisam-logo.png"
              alt="Logo BRISAM"
              width={220}
              height={60}
              className="h-auto w-40 transition-transform duration-300 group-hover:scale-[1.02] md:w-52"
              priority
            />
          </a>
          <nav aria-label="Navegacion principal" className="hidden gap-7 text-sm text-zinc-200 md:flex">
            <a className="transition hover:text-red-500" href="#servicios">
              Servicios
            </a>
            <a className="transition hover:text-red-500" href="#proyectos">
              Proyectos
            </a>
            <a className="transition hover:text-red-500" href="#sectores">
              Sectores
            </a>
            <a className="transition hover:text-red-500" href="#contacto">
              Contacto
            </a>
          </nav>
        </div>
      </header>

      <main id="inicio" className="pt-20">
        <section className="relative isolate overflow-hidden bg-black text-white">
          <div
            className="absolute inset-0 -z-20 bg-cover bg-center opacity-45"
            style={{
              backgroundImage:
                "url('https://images.unsplash.com/photo-1596704017254-9f9c6f8d10f5?auto=format&fit=crop&w=1800&q=80')"
            }}
            aria-hidden="true"
          />
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-black via-black/90 to-zinc-900/80" />
          <div className="site-container grid gap-10 py-20 md:py-28 lg:grid-cols-[1.25fr_0.75fr] lg:items-end">
            <div>
              <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs uppercase tracking-[0.18em] text-red-300">
                <span className="h-2 w-2 rounded-full bg-red-500" aria-hidden="true" />
                Servicios integrales para empresas
              </p>
              <h1 className="text-balance text-4xl font-semibold leading-tight sm:text-5xl lg:text-6xl">
                Mantenemos tu operacion siempre en marcha
              </h1>
              <p className="mt-5 max-w-2xl text-lg text-zinc-300">
                Soluciones preventivas y correctivas en mantenimiento HVAC, electrico, hidraulico y mas.
              </p>
              <div className="mt-9 flex flex-wrap gap-4">
                <a className="btn btn-primary" href="#contacto">
                  Solicitar servicio
                </a>
                <a
                  className="btn btn-secondary"
                  href="https://wa.me/520000000000"
                  target="_blank"
                  rel="noreferrer"
                >
                  WhatsApp
                </a>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {metrics.map((metric) => (
                <article
                  key={metric.label}
                  className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-xl shadow-black/20 transition hover:border-red-500/40 hover:bg-white/10"
                >
                  <p className="text-3xl font-semibold text-red-500">{metric.value}</p>
                  <p className="mt-2 text-sm text-zinc-300">{metric.label}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="servicios" className="section-space bg-white">
          <div className="site-container">
            <div className="max-w-2xl">
              <p className="section-kicker">Servicios</p>
              <h2 className="section-title">Cobertura tecnica integral para tu operacion</h2>
            </div>
            <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {services.map((service) => (
                <article
                  key={service.title}
                  className="group rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-red-200 hover:shadow-xl"
                >
                  <div className="inline-flex rounded-xl bg-red-50 p-3 text-red-600 transition group-hover:bg-red-600 group-hover:text-white">
                    <Icon name={service.icon} />
                  </div>
                  <h3 className="mt-5 text-xl font-semibold text-zinc-900">{service.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-zinc-600">{service.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section-space bg-zinc-50">
          <div className="site-container">
            <div className="max-w-2xl">
              <p className="section-kicker">Beneficios</p>
              <h2 className="section-title">Una operacion respaldada por procesos confiables</h2>
            </div>
            <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {benefits.map((benefit) => (
                <article
                  key={benefit.title}
                  className="rounded-2xl border border-zinc-200 bg-white p-6 transition hover:border-red-200 hover:shadow-lg"
                >
                  <div className="inline-flex rounded-xl bg-zinc-100 p-3 text-zinc-900">
                    <Icon name={benefit.icon} />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-zinc-900">{benefit.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-600">{benefit.detail}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="proyectos" className="section-space bg-white">
          <div className="site-container">
            <div className="max-w-2xl">
              <p className="section-kicker">Nuestros proyectos</p>
              <h2 className="section-title">Resultados visibles en cada sitio atendido</h2>
            </div>
            <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {projects.map((project) => (
                <article
                  key={project.title}
                  className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
                >
                  <div className="relative h-52 w-full overflow-hidden">
                    <Image
                      src={project.image}
                      alt={project.title}
                      fill
                      className="object-cover transition duration-500 hover:scale-105"
                    />
                  </div>
                  <div className="p-6">
                    <h3 className="text-lg font-semibold text-zinc-900">{project.title}</h3>
                    <p className="mt-2 text-sm text-zinc-500">{project.location}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="sectores" className="section-space bg-zinc-50">
          <div className="site-container">
            <div className="max-w-2xl">
              <p className="section-kicker">Sectores</p>
              <h2 className="section-title">Experiencia en operaciones de alto rendimiento</h2>
            </div>
            <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {sectors.map((sector) => (
                <article
                  key={sector}
                  className="rounded-xl border border-zinc-200 bg-white p-5 text-center font-medium text-zinc-700 transition hover:border-red-200 hover:text-red-600 hover:shadow-md"
                >
                  {sector}
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="app" className="section-space bg-black text-white">
          <div className="site-container grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
            <div>
              <p className="section-kicker section-kicker-dark">Plataforma digital BRISAM</p>
              <h2 className="section-title section-title-dark">
                Control total de tus servicios, con nuestra app
              </h2>
              <p className="mt-5 max-w-2xl text-zinc-300">
                Tus equipos podran visualizar tickets activos, historial de atenciones, evidencias fotograficas,
                reportes ejecutivos, metricas de desempeno y notificaciones en tiempo real desde un solo panel.
              </p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-zinc-900/70 p-6 shadow-xl shadow-black/30">
              <ul className="space-y-3 text-sm text-zinc-200">
                {[
                  "Gestion centralizada de tickets",
                  "Historial tecnico por sucursal",
                  "Evidencias fotograficas y checklists",
                  "Reportes y metricas SLA",
                  "Alertas y notificaciones en tiempo real"
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span className="mt-0.5 rounded-full bg-red-600/20 p-1 text-red-400">
                      <Icon name="app" />
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section id="clientes" className="section-space bg-white">
          <div className="site-container">
            <div className="max-w-2xl">
              <p className="section-kicker">Clientes</p>
              <h2 className="section-title">Empresas que confian en BRISAM</h2>
            </div>
            <div className="mt-10 flex flex-wrap gap-3">
              {clients.map((client) => (
                <span
                  key={client}
                  className="rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:border-red-200 hover:text-red-600"
                >
                  {client}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section id="contacto" className="section-space bg-zinc-950 text-white">
          <div className="site-container rounded-3xl border border-white/10 bg-zinc-900 px-6 py-10 md:px-10 md:py-14">
            <div className="grid gap-8 md:grid-cols-[1.2fr_0.8fr] md:items-center">
              <div>
                <p className="section-kicker section-kicker-dark">Siguiente paso</p>
                <h2 className="section-title section-title-dark">Estamos listos para ayudarte</h2>
                <p className="mt-4 max-w-xl text-zinc-300">
                  Cuentanos tu necesidad y te compartimos una propuesta personalizada para mantener tu operacion
                  segura, eficiente y siempre disponible.
                </p>
              </div>
              <div className="flex flex-wrap gap-4 md:justify-end">
                <a className="btn btn-primary" href="mailto:contacto@brisam.com">
                  Solicitar servicio
                </a>
                <a
                  className="btn btn-secondary"
                  href="https://wa.me/520000000000"
                  target="_blank"
                  rel="noreferrer"
                >
                  WhatsApp
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-200 bg-white py-10">
        <div className="site-container grid gap-8 md:grid-cols-3 md:items-start">
          <div>
            <Image src="/brisam-logo.png" alt="BRISAM" width={180} height={46} className="h-auto w-36" />
            <p className="mt-4 text-sm text-zinc-500">
              Servicios integrales de mantenimiento para empresas con enfoque en continuidad operativa.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-700">Cobertura</h3>
            <p className="mt-3 text-sm text-zinc-500">Atencion nacional para comercios, industria y oficinas.</p>
          </div>
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-700">Contacto</h3>
            <a className="mt-3 block text-sm text-zinc-500 transition hover:text-red-600" href="tel:+520000000000">
              +52 00 0000 0000
            </a>
            <a
              className="mt-1 block text-sm text-zinc-500 transition hover:text-red-600"
              href="mailto:contacto@brisam.com"
            >
              contacto@brisam.com
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
