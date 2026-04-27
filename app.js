const navItems = document.querySelectorAll('.nav-item');
const views = document.querySelectorAll('.view');

navItems.forEach((item) => {
  item.addEventListener('click', () => {
    navItems.forEach((n) => n.classList.remove('active'));
    item.classList.add('active');

    const target = item.dataset.view;
    views.forEach((view) => {
      view.classList.toggle('active', view.id === target);
    });
  });
});
