let tickets = [];
let assets = [];
let filtersReady = false;

const ticketTypeLabels = {
  contact: "Contact",
  hardware_problem: "Hardware problem",
  software_problem: "Software problem",
};

function getTicketTypeLabel(ticketType) {
  return ticketTypeLabels[ticketType] ?? "Hardware problem";
}

export async function createTicketsTable() {
  const table = document.getElementById("tickets-table");
  const ticketInfo = document.getElementById("ticket-info");

  renderTableShell(table, "Loading tickets...");
  setupTicketFilters();
  ticketInfo.textContent = "";

  try {
    const sessionResponse = await fetch("/session", {
      credentials: "same-origin",
    });
    const session = await sessionResponse.json();

    if (!session.authenticated) {
      tickets = [];
      assets = [];
      renderTableShell(table, "Log in to load your tickets.");
      return;
    }

    const [ticketsResponse, inventoryResponse] = await Promise.all([
      fetch("/tickets", { credentials: "same-origin" }),
      fetch("/inventory", { credentials: "same-origin" }),
    ]);

    if (!ticketsResponse.ok) {
      throw new Error("Could not load tickets");
    }

    if (!inventoryResponse.ok) {
      throw new Error("Could not load inventory");
    }

    tickets = await ticketsResponse.json();
    assets = await inventoryResponse.json();
    renderTickets();
  } catch (err) {
    renderTableShell(table, err.message);
  }
}

function setupTicketFilters() {
  if (filtersReady) return;

  const statusSelect = document.getElementById("status-select");
  const prioritySelect = document.getElementById("priority-select");
  const ticketSearch = document.getElementById("ticketSearch");

  statusSelect.addEventListener("change", renderTickets);
  prioritySelect.addEventListener("change", renderTickets);
  ticketSearch.addEventListener("input", renderTickets);

  filtersReady = true;
}

function renderTableShell(table, message) {
  table.replaceChildren();

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  ["ID", "User", "Machine", "Type", "Problem", "Priority", "Status", "Created"].forEach(label => {
    const th = document.createElement("th");
    th.textContent = label;
    headerRow.append(th);
  });
  thead.append(headerRow);

  const tbody = document.createElement("tbody");
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.colSpan = 8;
  cell.textContent = message;
  row.append(cell);
  tbody.append(row);

  table.append(thead, tbody);
}

function renderTickets() {
  const table = document.getElementById("tickets-table");
  const tbody = table.querySelector("tbody");
  const visibleTickets = getFilteredTickets();

  tbody.replaceChildren();

  if (visibleTickets.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 8;
    cell.textContent = tickets.length === 0 ? "No tickets yet." : "No tickets match these filters.";
    row.append(cell);
    tbody.append(row);
    return;
  }

  tbody.append(...visibleTickets.map(ticket => createTicketRow(ticket)));
}

function getFilteredTickets() {
  const status = document.getElementById("status-select").value;
  const priority = document.getElementById("priority-select").value;
  const search = document.getElementById("ticketSearch").value.trim().toLowerCase();

  return tickets.filter(ticket => {
    const matchesStatus = !status || ticket.status === status;
    const matchesPriority = !priority || ticket.priority === priority;
    const searchableText = [
      ticket.ticket_id,
      ticket.user_name,
      ticket.asset_tag,
      ticket.ticket_type,
      ticket.problem,
      ticket.priority,
      ticket.status,
    ].join(" ").toLowerCase();
    const matchesSearch = !search || searchableText.includes(search);

    return matchesStatus && matchesPriority && matchesSearch;
  });
}

function createTicketRow(ticket) {
  const row = document.createElement("tr");
  const ticketInfo = document.getElementById("ticket-info");
  const ticketUrl = `ticketInfo.html?ticket_id=${encodeURIComponent(ticket.ticket_id)}`;

  const createdAt = ticket.created_at
    ? new Date(ticket.created_at).toLocaleString()
    : "";

  [
    ticket.ticket_id,
    ticket.user_name,
    ticket.asset_tag,
    getTicketTypeLabel(ticket.ticket_type),
    ticket.problem,
    ticket.priority,
    ticket.status,
    createdAt,
  ].forEach(value => {
    const cell = document.createElement("td");
    cell.textContent = value ?? "";
    row.append(cell);
  });

  row.dataset.priority = ticket.priority;

  row.addEventListener("click", () => {
    const machine = assets.find(a => a.asset_tag === ticket.asset_tag);
    const warrantyStatus = getWarrantyStatus(machine?.warranty_expiry);
    const ticketCount = countTicketsForAsset(ticket.asset_tag);

    const repeatWarning = ticketCount > 1
      ? `<span style="color: red;">Repeat issue: ${ticketCount} tickets for this asset</span>`
      : "";

    ticketInfo.innerHTML = `<big>Ticket #${ticket.ticket_id}</big><br>${getTicketTypeLabel(ticket.ticket_type)} · ${ticket.asset_tag} - ${machine?.model ?? "unknown"} - ${machine?.ram_gb ?? "?"}GB - Warranty: ${warrantyStatus} <a class="ticket-more-link" href="${ticketUrl}" aria-label="View details for ticket ${ticket.ticket_id}">View details <span aria-hidden="true">→</span></a>
    <br> ${repeatWarning} `;
  });

  function getWarrantyStatus(warrantyDate) {
    if (!warrantyDate) return "Unknown";

    const expiry = new Date(warrantyDate);
    if (isNaN(expiry)) return "Unknown";

    return expiry >= new Date() ? "Active" : "Expired";
  }

  function countTicketsForAsset(assetTag) {
    return tickets.filter(t => t.asset_tag === assetTag).length;
  }

  return row;
}
