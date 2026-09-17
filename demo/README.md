# Demo

`insecure-app/` is a deliberately unprotected project, written the way an AI
coding tool usually produces one: the SQL is correct and nothing is protected.

Run the scanner against it:

```bash
npx github:humora2504/vibeproof demo/insecure-app
```

The expected output is in [expected-output.txt](expected-output.txt), and the
scanner is run against this folder on every push, so you can read a real run
rather than take the file's word for it: [latest run](https://github.com/humora2504/vibeproof/actions/workflows/demo.yml).

The credentials in `env.fixture` are fabricated and the placeholders are filled
in at run time, so nothing shaped like a key is ever committed.
