import { createTicketsTable } from "./ticketsTable.js";

export async function ticketSystem() {
    const addTicketButton = document.getElementById("add-ticket-button");
    const createTicketDialog = document.getElementById("create-ticket-dialog");
    const closeTicketDialog = document.getElementById("close-ticket-dialog");
    const ticketForm = document.getElementById("ticket-form");
    const ticketMessage = document.getElementById("ticket-message");
    const sendTicketButton = document.getElementById("send-ticket");
    const userSelect = document.getElementById("ticket-user");
    const machineSelect = document.getElementById("ticket-machine");
    let ticketOptions = [];

    addTicketButton.disabled = true;
    addTicketButton.title = "Log in to create a ticket";
    userSelect.addEventListener("change", updateMachineOptions);
    loadTicketOptions();
    
    addTicketButton.addEventListener("click", () => {
      ticketMessage.textContent = "";
      createTicketDialog.showModal();
    });
    
    closeTicketDialog.addEventListener("click", () => {
      createTicketDialog.close();
    });
    
    ticketForm.addEventListener("submit", event => {
      event.preventDefault();
      generateTicket();
    });
    
    async function generateTicket() {
      const user = userSelect.value.trim();
      const machine = machineSelect.value.trim();
      const ticketType = document.getElementById("ticket-type").value;
      const problem = document.getElementById("ticket-problem").value.trim();
      const problemDescription = document.getElementById("ticket-problem-extended").value.trim();
    
      ticketMessage.textContent = "";
    
      if (!user || !machine || !ticketType || !problem) {
        showTicketMessage("Fill in the user, machine, ticket type, and problem before sending.", "error");
        return;
      }
    
      sendTicketButton.disabled = true;
      sendTicketButton.textContent = "Sending...";
    
      try {
        const response = await fetch("/tickets", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "same-origin",
          body: JSON.stringify({ user, machine, ticketType, problem, problemDescription }),
        });
    
        const result = await response.json();
    
        if (!response.ok) {
          throw new Error(result.error || "Could not create ticket");
        }
    
        ticketForm.reset();
        updateMachineOptions();
        createTicketDialog.close();
        await createTicketsTable();
      } catch (err) {
        showTicketMessage(err.message, "error");
      } finally {
        sendTicketButton.disabled = false;
        sendTicketButton.textContent = "Send";
      }
    }

    async function loadTicketOptions() {
      ticketOptions = [];
      addTicketButton.disabled = true;
      userSelect.disabled = true;
      setSelectPlaceholder(userSelect, "Loading users...");
      setSelectPlaceholder(machineSelect, "Select a user first");

      try {
        const response = await fetch("/ticket-options", {
          credentials: "same-origin",
        });

        if (response.status === 401) {
          setSelectPlaceholder(userSelect, "Log in to create a ticket");
          addTicketButton.title = "Log in to create a ticket";
          return;
        }

        if (!response.ok) {
          throw new Error("Could not load users and machines");
        }

        ticketOptions = await response.json();
        const users = [...new Set(ticketOptions.map(option => option.full_name))]
          .sort((first, second) => first.localeCompare(second));

        setSelectPlaceholder(
          userSelect,
          users.length > 0 ? "Select user" : "No users with assigned machines"
        );

        users.forEach(user => {
          const option = document.createElement("option");
          option.value = user;
          option.textContent = user;
          userSelect.append(option);
        });

        userSelect.disabled = users.length <= 1;

        if (users.length === 1) {
          userSelect.value = users[0];
          updateMachineOptions();
        }

        addTicketButton.disabled = ticketOptions.length === 0;
        addTicketButton.title = ticketOptions.length === 0
          ? "No machine is assigned to this account"
          : "Create a ticket";
      } catch (err) {
        setSelectPlaceholder(userSelect, "Could not load users");
        showTicketMessage(err.message, "error");
      }
    }

    function updateMachineOptions() {
      const selectedUser = userSelect.value;
      const machines = ticketOptions.filter(option => option.full_name === selectedUser);

      setSelectPlaceholder(
        machineSelect,
        selectedUser ? "Select machine" : "Select a user first"
      );

      machines.forEach(machine => {
        const option = document.createElement("option");
        const machineName = [machine.brand, machine.model].filter(Boolean).join(" ");
        option.value = machine.asset_tag;
        option.textContent = machineName
          ? `${machine.asset_tag} - ${machineName}`
          : machine.asset_tag;
        machineSelect.append(option);
      });

      machineSelect.disabled = !selectedUser || machines.length === 0;
    }

    function setSelectPlaceholder(select, text) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = text;
      option.disabled = true;
      option.selected = true;
      select.replaceChildren(option);
    }
    
    function showTicketMessage(message, type) {
      ticketMessage.textContent = message;
      ticketMessage.dataset.type = type;
    }
    
    window.addEventListener("auth-changed", event => {
      if (!event.detail.authenticated && createTicketDialog.open) {
        createTicketDialog.close();
      }

      loadTicketOptions();
      createTicketsTable();
    });
    createTicketsTable();   
}
