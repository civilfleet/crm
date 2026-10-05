export class EmailDeliveryUncertainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailDeliveryUncertainError";
  }
}
