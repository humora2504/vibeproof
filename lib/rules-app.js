'use strict';
const { lineOf, stripComments, isClientSide, insideRegexLiteral } = require('./util');

const AUTH_HINT = /(auth|session|getUser|getSession|currentUser|requireUser|verifyJwt|verifyToken|clerk|nextauth|withAuth|authorize|permission|can\(|isAdmin|checkRole|jwt\.verify|createServerClient|unstable_getServerSession)/i;
const MUTATING = /\b(export\s+(?:async\s+)?(?:function|const)\s+(POST|PUT|PATCH|DELETE))\b/;

function run(file, text, ctx) {
  const out = [];
  const isCode = /\.(js|jsx|ts|tsx|mjs|cjs|svelte|vue|astro)$/.test(file.ext);
  const code = isCode ? stripComments(text) : text;

  // 1. Service-role Supabase client created in browser code.
  if (isCode && isClientSide(file.rel)) {
    const m = code.match(/createClient\s*\([^)]*SERVICE_ROLE[^)]*\)/i);
    // Only a public-prefixed variable or a literal key can actually reach the browser
    // bundle. A plain process.env.SUPABASE_SERVICE_ROLE_KEY is undefined client-side.
    const reachesBundle = m && (/(NEXT_PUBLIC_|VITE_|REACT_APP_|EXPO_PUBLIC_|PUBLIC_|NUXT_PUBLIC_|GATSBY_)[A-Z0-9_]*SERVICE_ROLE/i.test(m[0])
                                || /['"`]eyJ[A-Za-z0-9_-]{10,}/.test(m[0]));
    if (m && reachesBundle && !insideRegexLiteral(code, m.index)) {
      out.push({
        rule: 'APP-SERVICE-CLIENT-IN-BROWSER',
        severity: 'critical',
        title: 'A Supabase admin client is built in code that runs in the browser',
        // vibeproof-ignore
        file: file.rel, line: lineOf(code, m.index), evidence: 'createClient(…SERVICE_ROLE…)',
        why: 'A client built with the service_role key ignores every Row Level Security policy. Shipping it to the browser hands full database control to every visitor.',
        fix: 'Move this client into a server route, a server action or an edge function, and keep the key in a variable without a public prefix.',
        confidence: 'high',
      });
    }
  }

  // 2. Mutating API route with no visible authorisation check.
  if (isCode && /(\/api\/|\/route\.(js|ts)$|pages\/api\/)/.test(file.rel) && MUTATING.test(code)) {
    if (!AUTH_HINT.test(code)) {
      const m = code.match(MUTATING);
      out.push({
        rule: 'APP-UNAUTHENTICATED-MUTATION',
        severity: 'high',
        title: 'Endpoint that changes data with no authorisation check in sight',
        file: file.rel, line: lineOf(code, m.index), evidence: `export ${m[2]} handler with no auth or session call`,
        why: 'A handler that writes without checking who is calling can be driven by anyone with the URL, straight from a terminal.',
        fix: 'Load the caller at the top of the handler and return 401 when there is none, then check that the caller owns the record before writing.',
        confidence: 'low',
        note: 'Heuristic: this looks for common auth helper names. If your check lives in middleware or a wrapper, treat this as already handled.',
      });
    }
  }

  // 3. Server action that mutates with no check.
  if (isCode && /['"]use server['"]/.test(code) && /\b(insert|update|delete|upsert|destroy|remove)\s*\(/i.test(code) && !AUTH_HINT.test(code)) {
    const idx = code.search(/['"]use server['"]/);
    out.push({
      rule: 'APP-SERVER-ACTION-NO-AUTH',
      severity: 'high',
      title: 'Server action writes to the database without checking the caller',
      file: file.rel, line: lineOf(code, idx), evidence: "'use server' with a write call and no auth check",
      why: 'Server actions are reachable as HTTP endpoints. Anyone can call one directly, not only through your form.',
      fix: 'Read the session inside the action and reject the call when there is no user, before touching the database.',
      confidence: 'low',
      note: 'Heuristic. If authorisation happens in a shared wrapper, this is already handled.',
    });
  }

  // 4. Wide-open CORS on an endpoint.
  if (isCode && /(\/api\/|\/route\.(js|ts)$|pages\/api\/|middleware\.(js|ts)$)/.test(file.rel)) {
    const m = code.match(/['"]Access-Control-Allow-Origin['"]\s*[:,]\s*['"]\*['"]/);
    if (m && /Access-Control-Allow-Credentials/i.test(code)) {
      out.push({
        rule: 'APP-CORS-WILDCARD-CREDENTIALS',
        severity: 'high',
        title: 'CORS allows any origin together with credentials',
        file: file.rel, line: lineOf(code, m.index), evidence: "Allow-Origin: '*' with Allow-Credentials",
        why: 'This combination lets any website make authenticated requests on behalf of your logged-in users.',
        fix: 'List your own origins explicitly instead of using a wildcard when credentials are allowed.',
        confidence: 'high',
      });
    }
  }

  // 5. Authentication disabled or bypassed by a flag.
  if (isCode) {
    const m = code.match(/\b(SKIP_AUTH|DISABLE_AUTH|BYPASS_AUTH|AUTH_DISABLED|NO_AUTH)\b\s*[:=]\s*(true|['"]true['"]|1)/i);
    if (m) {
      out.push({
        rule: 'APP-AUTH-BYPASS-FLAG',
        severity: 'high',
        title: `Authentication bypass flag is switched on (${m[1]})`,
        file: file.rel, line: lineOf(code, m.index), evidence: m[0].slice(0, 50),
        why: 'Flags added to speed up local development routinely reach production and disable every check behind them.',
        fix: 'Remove the flag, or make it impossible to enable outside development by binding it to NODE_ENV !== "production".',
        confidence: 'medium',
      });
    }
  }

  // 6. A default or empty signing secret.
  if (isCode || file.isEnv) {
    const m = text.match(/\b(NEXTAUTH_SECRET|JWT_SECRET|SESSION_SECRET|AUTH_SECRET|COOKIE_SECRET)\s*[:=]\s*['"]?([^'"\n]{0,20})['"]?\s*$/m);
    if (m && m[2] !== undefined && (m[2].trim().length < 16)) {
      out.push({
        rule: 'APP-WEAK-SIGNING-SECRET',
        severity: 'high',
        title: `${m[1]} is empty or too short`,
        file: file.rel, line: lineOf(text, m.index), evidence: `${m[1]} = ${m[2].trim().length} characters`,
        why: 'Session and token signatures are only as strong as this value. A short or guessable secret lets an attacker mint valid sessions for any user.',
        fix: 'Generate at least 32 random bytes, for example: openssl rand -base64 32',
        confidence: 'medium',
      });
    }
  }

  // 7. SQL built by string concatenation.
  if (isCode) {
    const re = /(?:query|execute|raw|unsafe)\s*\(\s*[`'"](?:[^`'"]*?)(?:select|insert|update|delete)\b[^`'"]*?(?:\$\{|['"]\s*\+\s*)/gi;
    let m;
    while ((m = re.exec(code)) !== null) {
      out.push({
        rule: 'APP-SQL-CONCAT',
        severity: 'high',
        title: 'SQL statement built by joining strings',
        file: file.rel, line: lineOf(code, m.index), evidence: m[0].slice(0, 60).replace(/\s+/g, ' '),
        why: 'Values pasted into SQL text can end the statement and start another one. This is how whole tables get read or dropped.',
        fix: 'Use parameters instead of interpolation, for example: db.query("select * from t where id = $1", [id]).',
        confidence: 'medium',
      });
    }
  }
  return out;
}

/** Repository-level checks that need no file content. */
function finalize(ctx) {
  const out = [];
  if (ctx.hasEnvFile && !ctx.gitignoresEnv) {
    out.push({
      rule: 'APP-GITIGNORE-MISSING-ENV',
      severity: 'medium',
      title: '.gitignore does not exclude env files',
      file: '.gitignore', line: 1, evidence: 'no .env entry found',
      why: 'The next person to run "git add ." commits every credential in the project.',
      fix: 'Add these lines to .gitignore: .env and .env*.local',
      confidence: 'high',
    });
  }
  return out;
}

module.exports = { run, finalize, id: 'app' };
