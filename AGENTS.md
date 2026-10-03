<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Dropdown options live in src/lib/options.tsx (localStorage, React context); rows store chosen text values so editing options never rewrites saved quotations.
- Company details are snapshotted per quotation (Invoice.company); defaults only seed new quotations.
- Diamond rows store Stone and Type separately; legacy stone names migrate on quotation load without inferring absent Type values, preserving saved quotations.
- Diamond rows are edited inline (desktop table cells, mobile cards); no modal editor. Combo dropdown lists use fixed positioning so scroll containers never clip them.
- Quotations, settings, options and logos persist in Lovable Cloud via the browser module src/lib/cloud.ts calling SECURITY DEFINER RPCs app_login/app_call with a session token in localStorage; logos are stored inline as data URLs. Why: app must run on static hosts like Vercel with no server or service key.
