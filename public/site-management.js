import { naturalOrder } from './list-order.js';
/** Administration is isolated from production editors: no report/config writes
 * occur here, and each mutation is independently authorized by the server. */
import { permissionCodes as grantCodes } from './site-messages.js';
export function createSiteManagementUI({
  mount,
  api,
  getUser,
  t,
  esc,
  onNavigate,
  onAccessChange,
  confirm,
  toast,
}) {
  let view = 'sites',
    siteFilter = '',
    membershipSite = '',
    selected = null,
    editingSite = null,
    sites = [],
    users = [],
    revision = 0,
    busy = false;
  const system = () => getUser()?.systemRole === 'system_admin';
  const roleLabel = (role) => t('role_' + role);
  const input = (name, label, value = '', type = 'text', extra = '') =>
    `<label><span>${esc(t(label))}</span><input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
  const options = (items, value) =>
    items
      .map(
        ([id, label]) =>
          `<option value="${esc(id)}"${String(id) === String(value) ? ' selected' : ''}>${esc(label)}</option>`,
      )
      .join('');
  const siteOptions = (value) =>
    options(
      sites.map((site) => [
        site.id,
        `${site.site_code} · ${site.site_name}${site.is_active ? '' : ' · ' + t('accessInactive')}`,
      ]),
      value,
    );
  const grants = (values = ['production.read']) =>
    `<fieldset class="access-grants"><legend>${esc(t('accessPermissions'))}</legend>${grantCodes.map((code) => `<label><input type="checkbox" data-grant="${code}"${values.includes(code) ? ' checked' : ''}${code === 'production.read' || (code === 'data.import' && !values.includes('production.write')) ? ' disabled' : ''}>${esc(t('permission_' + code.replace('.', '_')))}</label>`).join('')}</fieldset>`;
  function draw() {
    const isSites = view === 'sites',
      current = selected && users.find((user) => user.id === selected),
      site = editingSite && sites.find((row) => row.id === editingSite);
    const canEdit =
      current &&
      current.system_role !== 'system_admin' &&
      (system() ||
        (current.system_role !== 'system_admin' &&
          !current.memberships.some((row) => row.role === 'site_admin')));
    mount.innerHTML = `<div class="error-banner" data-access-error role="alert" hidden></div><div class="access-layout">
      <section class="panel access-list">
      ${!isSites && system() ? `<label class="access-filter"><span>${esc(t('accessCurrentSite'))}</span><select data-access-filter><option value="">${esc(t('accessAllUsers'))}</option>${siteOptions(siteFilter)}</select></label>` : ''}
      <div class="access-table"><table><thead><tr>${(isSites ? ['accessSiteCode', 'accessSiteName', 'accessActive', 'accessUserCount'] : ['accessUsername', 'accessDisplayName', 'accessGlobalRole', 'accessMemberships', 'accessActive']).map((key) => `<th>${esc(t(key))}</th>`).join('')}<th>${esc(t('accessActions'))}</th></tr></thead><tbody>
      ${(isSites ? sites : users).map((row) => (isSites ? `<tr><td>${esc(row.site_code)}</td><td>${esc(row.site_name)}</td><td>${esc(t(row.is_active ? 'accessActive' : 'accessInactive'))}</td><td>${row.user_count}</td><td class="access-row-actions"><button class="button" data-access-action="edit-site" data-id="${row.id}">${esc(t('accessEdit'))}</button><button class="button" data-access-action="site-users" data-id="${row.id}">${esc(t('accessViewUsers'))}</button></td></tr>` : `<tr><td>${esc(row.username)}</td><td>${esc(row.display_name)}</td><td>${esc(roleLabel(row.system_role))}</td><td>${row.memberships.map((member) => `<span class="access-membership">${esc(sites.find((site) => site.id === member.site_id)?.site_code || getUser().site?.site_code || '')} · ${esc(roleLabel(member.role))}</span>`).join('')}</td><td>${esc(t(row.is_active ? 'accessActive' : 'accessInactive'))}</td><td><button class="button" data-access-action="edit-user" data-id="${esc(row.id)}">${esc(t('accessEdit'))}</button></td></tr>`)).join('') || `<tr><td colspan="6">${esc(t('accessEmpty'))}</td></tr>`}
      </tbody></table></div></section>
      <section class="panel access-editor">
      ${
        isSites
          ? `<form data-access-form="site" novalidate><h2>${esc(t(site ? 'accessEditSite' : 'accessAddSite'))}</h2>${input('site_code', 'accessSiteCode', site?.site_code || '', 'text', 'maxlength="32" required')}${input('site_name', 'accessSiteName', site?.site_name || '', 'text', 'maxlength="100" required')}<label class="access-check"><input name="is_active" type="checkbox"${!site || site.is_active ? ' checked' : ''}>${esc(t('accessActive'))}</label><div class="access-row-actions"><button class="button primary" type="submit">${esc(t('accessSave'))}</button>${site ? `<button class="button" type="button" data-access-action="cancel">${esc(t('accessCancel'))}</button>` : ''}</div></form>`
          : `<form data-access-form="${current ? 'user' : 'create-user'}" novalidate><h2>${esc(t(current ? 'accessEditUser' : 'accessAddUser'))}</h2>${input('username', 'accessUsername', current?.username || '', 'text', current ? 'disabled' : 'maxlength="100" required autocomplete="off"')}${!current || system() ? input('display_name', 'accessDisplayName', current?.display_name || '', 'text', 'maxlength="100"') : ''}${!current || system() ? input('password', current ? 'accessNewPassword' : 'accessPassword', '', 'password', 'autocomplete="new-password" maxlength="200"') : ''}
      ${
        system()
          ? `<label><span>${esc(t('accessGlobalRole'))}</span><select name="system_role">${options(
              ['user', 'system_admin'].map((role) => [role, roleLabel(role)]),
              current?.system_role || 'user',
            )}</select></label>`
          : ''
      }
      ${current && system() ? `<label class="access-check"><input name="is_active" type="checkbox"${current.is_active ? ' checked' : ''}>${esc(t('accessActive'))}</label>` : ''}
      ${
        !current
          ? `<label><span>${esc(t('accessCurrentSite'))}</span><select name="site_id">${siteOptions(siteFilter || getUser().site?.id || sites[0]?.id)}</select></label>${
              system()
                ? `<label><span>${esc(t('accessSiteRole'))}</span><select name="site_role">${options(
                    ['user', 'site_admin'].map((role) => [role, roleLabel(role)]),
                    'user',
                  )}</select></label>`
                : ''
            }${grants()}`
          : ''
      }
      ${!current || system() ? `<button class="button primary" type="submit">${esc(t('accessSave'))}</button>` : ''}
      ${current ? `<button class="button" type="button" data-access-action="cancel">${esc(t('accessAddUser'))}</button>` : ''}</form>
      ${
        canEdit
          ? `<form data-access-form="membership" novalidate><h2>${esc(t('accessMemberships'))}</h2><label><span>${esc(t('accessCurrentSite'))}</span><select name="site_id" data-access-membership-site>${siteOptions(membershipSite || siteFilter || current.memberships[0]?.site_id || getUser().site?.id || sites[0]?.id)}</select></label><label><span>${esc(t('accessSiteRole'))}</span><select name="role">${options(
              (system() ? ['user', 'site_admin'] : ['user']).map((role) => [
                role,
                roleLabel(role),
              ]),
              'user',
            )}</select></label>${grants()}<div class="access-row-actions"><button class="button primary" type="submit">${esc(t('accessGrant'))}</button><button class="button danger" type="button" data-access-action="revoke">${esc(t('accessRevoke'))}</button></div></form>`
          : ''
      }`
      }
      </section></div>`;
    if (canEdit) updateMembershipForm();
  }
  function updateMembershipForm() {
    const form = mount.querySelector('[data-access-form="membership"]');
    if (!form) return;
    const user = users.find((user) => user.id === selected),
      member = user?.memberships.find(
        (row) => String(row.site_id) === form.elements.site_id.value,
      );
    form.elements.role.value = member?.role || 'user';
    form.querySelectorAll('[data-grant]').forEach((box) => {
      box.checked = (member?.permissions || ['production.read']).includes(box.dataset.grant);
      box.disabled = member?.role === 'site_admin' || box.dataset.grant === 'production.read';
    });
    form.querySelector('[data-access-action="revoke"]').disabled = !member;
    form.querySelector('[data-grant="data.import"]').disabled =
      member?.role === 'site_admin' ||
      !form.querySelector('[data-grant="production.write"]').checked;
  }
  function error(value) {
    const box = mount.querySelector('[data-access-error]');
    if (box) {
      box.textContent = value.message;
      box.hidden = false;
    }
  }
  async function render(nextView = view) {
    view = nextView;
    const ticket = ++revision;
    mount.hidden = false;
    mount.innerHTML = `<p role="status">${esc(t('accessLoading'))}</p>`;
    try {
      const result = system()
        ? await api('/api/admin/sites')
        : {
            sites: getUser()
              .sites.filter((site) => site.id === getUser().site?.id)
              .map((site) => ({ ...site, is_active: 1 })),
          };
      if (ticket !== revision) return;
      sites = naturalOrder(result.sites, undefined, (site) => site.site_code);
      if (!system()) siteFilter = String(getUser().site?.id || '');
      if (view === 'users') {
        const result = await api(
          '/api/admin/users' + (siteFilter ? '?site_id=' + encodeURIComponent(siteFilter) : ''),
        );
        if (ticket !== revision) return;
        users = naturalOrder(result.users, undefined, (user) => user.username);
      }
      draw();
    } catch (value) {
      if (ticket !== revision) return;
      mount.innerHTML = '<div class="error-banner" data-access-error role="alert"></div>';
      error(value);
    }
  }
  mount.addEventListener('change', (event) => {
    if (['role', 'site_role'].includes(event.target.name)) {
      const full = event.target.value === 'site_admin';
      event.target
        .closest('form')
        .querySelectorAll('[data-grant]')
        .forEach((box) => {
          box.checked = full || box.dataset.grant === 'production.read';
          box.disabled = full || box.dataset.grant === 'production.read';
        });
    }
    if (event.target.dataset.grant === 'production.write') {
      const box = event.target.closest('form').querySelector('[data-grant="data.import"]');
      box.disabled = !event.target.checked;
      if (!event.target.checked) box.checked = false;
    }
    if (event.target.matches('[data-access-filter]')) {
      siteFilter = event.target.value;
      selected = null;
      render();
    }
    if (event.target.matches('[data-access-membership-site]')) {
      membershipSite = event.target.value;
      updateMembershipForm();
    }
  });
  mount.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    const form = event.target,
      key = form.dataset.accessForm,
      data = Object.fromEntries(new FormData(form));
    const grantValues = () =>
      [...form.querySelectorAll('[data-grant]:checked')].map((box) => box.dataset.grant);
    busy = true;
    form.querySelectorAll('button').forEach((button) => (button.disabled = true));
    try {
      if (key === 'site')
        await api('/api/admin/sites' + (editingSite ? '/' + editingSite : ''), {
          method: editingSite ? 'PATCH' : 'POST',
          body: JSON.stringify({ ...data, is_active: form.elements.is_active.checked }),
        });
      if (key === 'create-user')
        await api('/api/admin/users', {
          method: 'POST',
          body: JSON.stringify({
            ...data,
            ...(data.site_id ? { site_id: Number(data.site_id) } : { site_id: undefined }),
            permissions: grantValues(),
          }),
        });
      if (key === 'user')
        await api('/api/admin/users/' + selected, {
          method: 'PATCH',
          body: JSON.stringify({
            display_name: data.display_name,
            system_role: data.system_role,
            is_active: form.elements.is_active.checked,
            ...(data.password ? { password: data.password } : {}),
          }),
        });
      if (key === 'membership')
        await api(`/api/admin/users/${selected}/sites/${data.site_id}`, {
          method: 'PUT',
          body: JSON.stringify({ role: data.role, permissions: grantValues() }),
        });
      editingSite = null;
      await onAccessChange();
      await render();
      toast(t('accessSaved'));
    } catch (value) {
      error(value);
    } finally {
      busy = false;
      form.querySelectorAll('button').forEach((button) => (button.disabled = false));
    }
  });
  mount.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-access-action]');
    if (!button || busy) return;
    const action = button.dataset.accessAction;
    if (action === 'edit-site') {
      editingSite = Number(button.dataset.id);
      draw();
    }
    if (action === 'edit-user') {
      membershipSite = '';
      selected = button.dataset.id;
      draw();
    }
    if (action === 'cancel') {
      selected = null;
      editingSite = null;
      draw();
    }
    if (action === 'site-users') {
      siteFilter = button.dataset.id;
      selected = null;
      await onNavigate('users');
    }
    if (action === 'revoke' && (await confirm('accessRevokeConfirm'))) {
      busy = true;
      try {
        const site = mount.querySelector('[data-access-form="membership"]').elements.site_id
          .value;
        await api(`/api/admin/users/${selected}/sites/${site}`, {
          method: 'DELETE',
          body: '{}',
        });
        await onAccessChange();
        selected = null;
        await render();
        toast(t('accessSaved'));
      } catch (value) {
        error(value);
      } finally {
        busy = false;
      }
    }
  });
  return {
    render,
    hide() {
      revision++;
      mount.hidden = true;
    },
    isBusy: () => busy,
  };
}
