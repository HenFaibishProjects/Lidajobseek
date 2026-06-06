# Lidajobseek Backend

## WhatsApp Reminders Configuration (GREEN-API)

> [!NOTE]
> This integration is intended for **personal use only** to send reminders to your own phone number.

To enable WhatsApp reminders for interview schedules, configure the following environment variables in your `.env` file:

```env
# GREEN-API Configuration
GREEN_API_ID_INSTANCE=your_id_instance_here
GREEN_API_TOKEN_INSTANCE=your_token_instance_here
GREEN_API_RECIPIENT_PHONE=972XXXXXXXXX
```

- **GREEN_API_ID_INSTANCE**: Your GREEN-API Instance ID (e.g. `1101827472`).
- **GREEN_API_TOKEN_INSTANCE**: Your GREEN-API Instance API Token.
- **GREEN_API_RECIPIENT_PHONE**: Your phone number in international format without the `+` prefix (e.g. `972501234567` or `14155552671`).

### Setup Instructions
1. Create a **GREEN-API** account.
2. Create a **Developer** instance.
3. Scan the QR code from WhatsApp **Linked Devices** to authorize your instance.
4. Copy `idInstance` and `apiTokenInstance` into the environment variables in your `.env` file.
5. Use your phone number in international format without `+` for `GREEN_API_RECIPIENT_PHONE`.

---

## Testing WhatsApp Reminders

### Prerequisites
1. Ensure your GREEN-API instance is authorized and connected.
2. Start the backend with the environment variables set.

### 1. Manual/Automated Test Endpoint

To verify sending reminders, we provide a public debug endpoint that checks reminder statuses and allows force-sending them.

#### A. Check Upcoming Reminders Status
Send a GET request to:
```
GET http://localhost:3000/api/interactions/debug-reminders
```
**Response JSON will include:**
- `smtpConfigured` (boolean)
- `greenApiConfigured` (boolean)
- List of upcoming interactions, their scheduled reminders, whether they are due, and if WhatsApp / Email has already been sent.

#### B. Force Send Due Reminders
Send a POST request to:
```
POST http://localhost:3000/api/interactions/debug-reminders/force-send
```
This forces the scheduler to process any due, unsent reminders immediately and logs the output.
