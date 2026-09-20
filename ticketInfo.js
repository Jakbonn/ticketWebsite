const ticketNumber = document.getElementById("ticket-number");
const ticketInfoContainer = document.getElementById("ticket-info-container");
const ticketCreatedStatus = document.getElementById("ticket-created-status");
const params = new URLSearchParams(window.location.search);
const ticketId = params.get("ticket_id");

const ticketTypeLabels = {
  contact: "Contact",
  hardware_problem: "Hardware problem",
  software_problem: "Software problem",
};

function getTicketTypeLabel(ticketType) {
  return ticketTypeLabels[ticketType] ?? "Hardware problem";
}

const statusLabels = {
  new: "New",
  inprogress: "In progress",
  resolved: "Resolved",
};

function getStatusLabel(status) {
  return statusLabels[status] ?? "Unknown";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) {
    return "Unknown";
  }

  const isoDate = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (isoDate) {
    return `${isoDate[3]}/${isoDate[2]}/${isoDate[1]}`;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "Unknown"
    : date.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
}

if (!ticketId) {
  ticketNumber.textContent = "Ticket not found";
} else {
  ticketNumber.textContent = `Ticket: ${ticketId}`;
  loadTicket(ticketId);
}

async function loadTicket(ticketId) {
  try {
    const [sessionResponse, ticketsResponse, inventoryResponse] = await Promise.all([
      fetch("/session", { credentials: "same-origin" }),
      fetch("/tickets", { credentials: "same-origin" }),
      fetch("/inventory", { credentials: "same-origin" }),
    ]);

    const session = await sessionResponse.json();

    if (!session.authenticated) {
      throw new Error("Log in on the dashboard to load ticket details.");
    }

    if (!ticketsResponse.ok) {
      throw new Error("Could not load ticket details.");
    }
    if (!inventoryResponse.ok) {
      throw new Error("Could not load machine details.");
    }

    const tickets = await ticketsResponse.json();
    const inventory = await inventoryResponse.json();
    const ticket = tickets.find(item => String(item.ticket_id) === String(ticketId));

    if (!ticket) {
      ticketNumber.textContent = "Ticket not found";
      return;
    }

    const machine = inventory.find(
      item => item.asset_tag === ticket.asset_tag
    );
    const isAdmin = session.user?.role === "admin";
    const statusControls = isAdmin
      ? `
        <div class="ticket-status-control">
          <label for="ticket-status">Status</label>
          <div class="ticket-status-row">
            <select id="ticket-status">
              <option value="new" ${ticket.status === "new" ? "selected" : ""}>New</option>
              <option value="inprogress" ${ticket.status === "inprogress" ? "selected" : ""}>In progress</option>
              <option value="resolved" ${ticket.status === "resolved" ? "selected" : ""}>Resolved</option>
            </select>
            <button type="button" class="btn btn-primary" id="save-ticket-status">Save status</button>
          </div>
          <p id="ticket-status-message" role="status"></p>
        </div>

        <button type="button" class="delete-ticket-button btn btn-danger" id="delete-ticket">
          Delete ticket
        </button>
      `
      : `
        <div class="ticket-status-control">
          <span>Status</span>
          <strong>${getStatusLabel(ticket.status)}</strong>
        </div>
      `;

    ticketNumber.textContent = `Ticket: ${ticket.ticket_id}`;

    ticketCreatedStatus.innerHTML = `
      Created: ${formatDate(ticket.created_at)}
    `;

    ticketInfoContainer.style.cssText =
      "width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;";

    ticketInfoContainer.innerHTML = `
      <table style="
        width: 100%;
      ">
        <tr>
          <td>
            Machine: <br>
            <big>${escapeHtml(machine?.asset_tag ?? "Unknown")}</big>
          </td>
          <td>
            Serial number: <br>
            <big>${escapeHtml(machine?.serial_number ?? "Unknown")}</big>
          </td>
          <td>
            Brand: <br>
            <big>${escapeHtml(machine?.brand ?? "Unknown")}</big>
          </td>
        </tr>
        <tr>
          <td>
            Model: <br>
            <big>${escapeHtml(machine?.model ?? "Unknown")}</big>
          </td>
          <td>
            Purchase date: <br>
            <big>${formatDate(machine?.purchase_date)}</big>
          </td>
          <td>
            Warranty expiry: <br>
            <big>${formatDate(machine?.warranty_expiry)}</big>
          </td>
        </tr>
        <tr>
          <td>
            Type: <br>
            <big>${getTicketTypeLabel(ticket.ticket_type)}</big> 
          </td>
          <td>
            Problem: <br>
            <big>${escapeHtml(ticket.problem ?? "Unknown")}</big>
          </td>
        </tr>
      </table><br>

      <div class="ticket-problem-description">
        <span>Problem description</span>
        <p>${escapeHtml(ticket.problem_description || "No additional description.")}</p>
      </div>

      ${statusControls}
    `;

    if (!isAdmin) {
      return;
    }

    document.getElementById("save-ticket-status").addEventListener("click", async event => {
      const saveButton = event.currentTarget;
      const statusSelect = document.getElementById("ticket-status");
      const statusMessage = document.getElementById("ticket-status-message");
      saveButton.disabled = true;
      statusMessage.textContent = "Saving...";

      try {
        const statusResponse = await fetch(`/tickets/${ticket.ticket_id}/status`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "same-origin",
          body: JSON.stringify({ status: statusSelect.value }),
        });

        const result = await statusResponse.json().catch(() => ({}));

        if (!statusResponse.ok) {
          throw new Error(result.error || "Could not update ticket status.");
        }

        ticket.status = result.status;
        statusMessage.textContent = `Status updated to ${getStatusLabel(ticket.status)}.`;
      } catch (err) {
        statusMessage.textContent = err.message;
      } finally {
        saveButton.disabled = false;
      }
    });

    document.getElementById("delete-ticket").addEventListener("click", async event => {
      if (!window.confirm("Delete this ticket?")) {
        return;
      }

      const deleteButton = event.currentTarget;
      deleteButton.disabled = true;

      try {
        const deleteResponse = await fetch(`/tickets/${ticket.ticket_id}`, {
          method: "DELETE",
          credentials: "same-origin",
        });

        if (!deleteResponse.ok) {
          const error = await deleteResponse.json().catch(() => ({}));
          throw new Error(error.error || "Could not delete ticket.");
        }

        window.location.href = "index.html";
      } catch (err) {
        deleteButton.disabled = false;
        const errorMessage = document.createElement("p");
        errorMessage.textContent = err.message;
        ticketNumber.append(errorMessage);
      }
    });
  } catch (err) {
    ticketNumber.textContent = `Ticket: ${ticketId}`;
    const errorMessage = document.createElement("p");
    errorMessage.textContent = err.message;
    ticketNumber.append(errorMessage);
  }
}
