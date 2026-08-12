document.addEventListener('DOMContentLoaded', () => {
    // SMS Parsing Utility
    class SMSParser {
        static parseExpenseSMS(message) {
            // Regex patterns for different bank SMS formats
            const patterns = {
                debit: [
                    /debited.*?₹(\d+(?:\.\d{1,2})?)/i,
                    /withdrawn.*?₹(\d+(?:\.\d{1,2})?)/i
                ],
                categories: {
                    'groceries': ['big bazaar', 'dmart', 'reliance', 'grocery'],
                    'dining': ['swiggy', 'zomato', 'restaurant', 'cafe'],
                    'utilities': ['electricity', 'water', 'bill payment']
                }
            };

            let amount = null;
            let category = 'uncategorized';

            // Find amount
            for (let pattern of patterns.debit) {
                const match = message.match(pattern);
                if (match) {
                    amount = parseFloat(match[1]);
                    break;
                }
            }

            // Determine category
            for (let [cat, keywords] of Object.entries(patterns.categories)) {
                if (keywords.some(keyword => message.toLowerCase().includes(keyword))) {
                    category = cat;
                    break;
                }
            }

            return amount ? { amount, category } : null;
        }
    }

    // Charts Utility
    class ExpenseCharts {
        static createPieChart(ctx, data) {
            return new Chart(ctx, {
                type: 'pie',
                data: {
                    labels: Object.keys(data),
                    datasets: [{
                        data: Object.values(data),
                        backgroundColor: [
                            '#FF6384', '#36A2EB', '#FFCE56', 
                            '#4BC0C0', '#9966FF', '#FF9F40'
                        ]
                    }]
                }
            });
        }

        static createBarChart(ctx, data) {
            return new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: Object.keys(data),
                    datasets: [{
                        label: 'Monthly Expenses',
                        data: Object.values(data),
                        backgroundColor: '#3498db'
                    }]
                }
            });
        }
    }

    // Expense Management
    class ExpenseManager {
        static addExpense(category, amount) {
            const expenses = JSON.parse(localStorage.getItem('expenses') || '{}');
            expenses[category] = (expenses[category] || 0) + amount;
            localStorage.setItem('expenses', JSON.stringify(expenses));
        }

        static getMonthlyReport() {
            const expenses = JSON.parse(localStorage.getItem('expenses') || '{}');
            const total = Object.values(expenses).reduce((a, b) => a + b, 0);
            return { expenses, total };
        }
    }

    // Event Listeners and Interactions
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) {
        loginBtn.addEventListener('click', () => {
            // Implement login/signup modal or redirect
            alert('Login functionality to be implemented');
        });
    }
});