// Un evento de dominio es un hecho del negocio que ya ocurrió ("se confirmó
// un pedido"). Es la forma en que un bounded context avisa a los demás sin
// conocerlos: el que publica no sabe quién escucha.
export interface DomainEvent {
  readonly name: string;
}

// Cada clase de evento declara un NAME estático y único; el bus lo usa para
// enrutar y para tipar los handlers.
export interface DomainEventType<E extends DomainEvent> {
  readonly NAME: string;
  new (...args: never[]): E;
}
