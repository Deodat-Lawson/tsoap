import { createOrderServiceClient } from "../generated/order.js";

async function main() {
  const client = await createOrderServiceClient(
    "http://localhost:8080/order?wsdl",
  );

  const order = await client.OrderService.OrderPort.CreateOrder({
    customerId: "cust-123",
    items: [
      { sku: "WIDGET-01", quantity: 2, price: 19.99 },
      { sku: "GADGET-05", quantity: 1, price: 49.99 },
    ],
    notes: "Please gift wrap",
  });

  console.log(`Order ${order.orderId} created, total: $${order.total}`);

  const status = await client.OrderService.OrderPort.GetOrderStatus({
    orderId: order.orderId,
  });

  console.log(`Status: ${status.status}, updated: ${status.updatedAt}`);

  const cancel = await client.OrderService.OrderPort.CancelOrder({
    orderId: order.orderId,
    reason: "Changed my mind",
  });

  console.log(`Cancelled: ${cancel.success} — ${cancel.message}`);
}

main().catch(console.error);
