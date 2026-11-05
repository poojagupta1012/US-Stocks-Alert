# Hosting on Oracle Cloud Always Free

Runs the alert server around the clock on a free Oracle Cloud VM, so alerts keep firing when your laptop is off. The Telegram bot works from anywhere. The web form stays on your laptop and connects through SSH when you need it.

## 1. Create the VM
1. Sign up at https://www.oracle.com/cloud/free/. A card is needed to verify your identity, but Always Free resources aren't charged. Pick a home region close to you, such as Mumbai or Hyderabad. It can't be changed later.
2. Go to **Compute > Instances > Create instance**.
   - **Image:** Canonical Ubuntu 24.04.
   - **Shape:** Ampere `VM.Standard.A1.Flex` with 1 OCPU and 6 GB memory. If it says "out of capacity", choose AMD `VM.Standard.E2.1.Micro` instead, which also works fine.
   - **SSH keys:** select "Save private key", or paste your own public key from `~/.ssh/id_ed25519.pub`.
3. Create it, then copy its **Public IP address**.

Leave the firewall as it is. Only SSH (port 22) needs to be open, because the server makes outgoing connections and the bot polls Telegram.

## 2. Allow the VM in MongoDB Atlas
In Atlas, go to **Network Access > Add IP Address** and add the VM's public IP.

## 3. Install the server
```bash
# On your laptop
chmod 600 ~/Downloads/ssh-key-*.key          # only if you downloaded Oracle's key
ssh -i ~/Downloads/ssh-key-*.key ubuntu@<vm-ip>

# On the VM
curl -fsSL https://raw.githubusercontent.com/poojagupta1012/US-Stocks-Alert/feature/stock-alert-app/deploy/oracle/setup.sh | bash
```

Then copy your keys over. The `.env` file isn't in the repo, so it has to be sent directly:
```bash
# On your laptop, from the repo folder
scp -i ~/Downloads/ssh-key-*.key server/.env ubuntu@<vm-ip>:~/US-Stocks-Alert/server/.env
```

## 4. Switch over from the laptop
**Stop the server on your laptop first.** Finnhub allows one connection per API key and Telegram allows one poller per bot, so two servers running at once kick each other off.

```bash
# On the VM
sudo systemctl start us-stocks-alert
journalctl -u us-stocks-alert -f      # expect "[finnhub] WebSocket connected" and "[telegram] Bot ready"
```

Send `/alerts` to the bot to check that it answers.

## Day to day
| Task | Command (on the VM) |
|---|---|
| Live logs | `journalctl -u us-stocks-alert -f` |
| Status | `systemctl status us-stocks-alert` |
| Restart | `sudo systemctl restart us-stocks-alert` |
| Deploy the latest pushed code | `~/US-Stocks-Alert/deploy/oracle/update.sh` |
| Health check | `curl -s localhost:4000/api/health` |

The service starts on boot and restarts within 5 seconds if it crashes.

## Using the web form
The API has no login, so it isn't exposed to the internet. Forward it to your laptop over SSH instead:
```bash
ssh -i ~/Downloads/ssh-key-*.key -N -L 4000:localhost:4000 ubuntu@<vm-ip>
```
Leave that running and start the client with `npm run dev` as usual. It talks to `localhost:4000`, which now reaches the VM.

## Good to know
- **Idle reclaim:** Oracle may reclaim Always Free VMs that stay almost idle for 7 days, and this server uses very little CPU. To avoid that, upgrade the account to **Pay As You Go** under Billing. Always Free resources stay free after the upgrade. Set a budget alert of ₹1 for peace of mind.
- **Switching back to the laptop:** run `sudo systemctl stop us-stocks-alert` on the VM before starting the server locally.
