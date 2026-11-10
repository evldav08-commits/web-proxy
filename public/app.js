const form = document.querySelector('#proxy-form');
const input = document.querySelector('#url');
const error = document.querySelector('#error');
form.addEventListener('submit', event => {
  event.preventDefault();
  error.textContent = '';
  let value = input.value.trim();
  if (!/^https?:\\/\\//i.test(value)) value = 'https://' + value;
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
    location.href = '/proxy?url=' + encodeURIComponent(parsed.href);
  } catch {
    error.textContent = 'Please enter a valid HTTP or HTTPS address.';
  }
});
