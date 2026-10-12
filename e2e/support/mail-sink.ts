import { createServer } from 'node:http';
import { simpleParser } from 'mailparser';
import { SMTPServer } from 'smtp-server';

/**
 * A mail server for the tests: it accepts every message over SMTP and keeps it in memory, so a test can read the
 * link of an invitation or a recovery without sending anything to a real mailbox. It plays the role of the
 * mailbox of cPanel in the real instances.
 *
 *   SMTP  127.0.0.1:MAIL_SINK_SMTP_PORT   what the API sends to
 *   HTTP  127.0.0.1:MAIL_SINK_HTTP_PORT   GET /messages?to=<address>, DELETE /messages
 */
export interface SinkMessage {
  to: string[];
  subject: string;
  text: string;
}

const smtpPort = Number(process.env.MAIL_SINK_SMTP_PORT ?? 2525);
const httpPort = Number(process.env.MAIL_SINK_HTTP_PORT ?? 8025);
const messages: SinkMessage[] = [];

const smtp = new SMTPServer({
  authOptional: true,
  disabledCommands: ['STARTTLS'],
  allowInsecureAuth: true,
  onAuth: (_auth, _session, done) => done(null, { user: 'e2e' }),
  onData(stream, _session, done) {
    simpleParser(stream)
      .then((mail) => {
        const recipients = [mail.to].flat().flatMap((group) => group?.value ?? []);
        messages.push({
          to: recipients.map((recipient) => recipient.address?.toLowerCase() ?? ''),
          subject: mail.subject ?? '',
          text: mail.text ?? '',
        });
        done();
      })
      .catch(done);
  },
});
smtp.listen(smtpPort, '127.0.0.1');

createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  if (url.pathname !== '/messages') {
    response.writeHead(404).end();
    return;
  }
  if (request.method === 'DELETE') {
    messages.length = 0;
    response.writeHead(204).end();
    return;
  }
  const to = url.searchParams.get('to')?.toLowerCase();
  const found = to ? messages.filter((message) => message.to.includes(to)) : messages;
  response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(found));
}).listen(httpPort, '127.0.0.1');
