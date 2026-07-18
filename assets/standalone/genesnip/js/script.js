// Select elements
const image = document.getElementById('variable-pear');
const input = document.getElementById('location-input');

// Load saved value or use default
const savedValue = localStorage.getItem('location-input');
input.value = savedValue || '60'; // Default to 50 if no saved value
image.style.top = input.value ? `${input.value}vh` : '0';

// Update top position and save when Enter is pressed
input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.keyCode === 13) {
        const value = input.value;
        image.style.top = value ? `${value}vh` : '0';
        localStorage.setItem('location-input', value);
    }
});