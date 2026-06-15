import { useState, useEffect } from 'react';
import './TodoList.css';

const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';

function TodoList() {
  const [todos, setTodos] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchTodos = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/todos`);
      const data = await res.json();
      setTodos(data.todos || []);
    } catch (err) {
      console.error('Failed to fetch todos:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTodos(); }, []);

  const addTodo = async (e) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    await fetch(`${API_BASE}/api/todos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: inputValue.trim() }),
    });
    setInputValue('');
    fetchTodos();
  };

  const toggleTodo = async (id, completed) => {
    await fetch(`${API_BASE}/api/todos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: !completed }),
    });
    fetchTodos();
  };

  const deleteTodo = async (id) => {
    await fetch(`${API_BASE}/api/todos/${id}`, { method: 'DELETE' });
    fetchTodos();
  };

  const clearCompleted = async () => {
    await fetch(`${API_BASE}/api/todos`, { method: 'DELETE' });
    fetchTodos();
  };

  const completedCount = todos.filter((t) => t.completed).length;
  const totalCount = todos.length;

  return (
    <div className="todo-list">
      <form className="todo-form" onSubmit={addTodo}>
        <input
          type="text"
          className="todo-input"
          placeholder="할 일을 입력하세요..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
        />
        <button type="submit" className="todo-add-btn">
          +
        </button>
      </form>

      <div className="todo-items">
        {todos.length === 0 ? (
          <div className="todo-empty">
            <span>할 일이 없습니다</span>
          </div>
        ) : (
          todos.map((todo) => (
            <div
              key={todo.id}
              className={`todo-item ${todo.completed ? 'completed' : ''}`}
            >
              <button
                className="todo-checkbox"
                onClick={() => toggleTodo(todo.id, todo.completed)}
              >
                {todo.completed ? '✓' : ''}
              </button>
              <span className="todo-text">{todo.text}</span>
              <button
                className="todo-delete"
                onClick={() => deleteTodo(todo.id)}
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>

      {totalCount > 0 && (
        <div className="todo-footer">
          <span className="todo-count">
            {completedCount}/{totalCount} 완료
          </span>
          {completedCount > 0 && (
            <button className="todo-clear" onClick={clearCompleted}>
              완료 항목 삭제
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default TodoList;
