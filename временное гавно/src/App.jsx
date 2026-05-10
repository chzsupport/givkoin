import { ShieldCheck } from 'lucide-react';
import HoldToVerify from './variants/HoldToVerify';
import SliderPuzzle from './variants/SliderPuzzle';
import OrderSequence from './variants/OrderSequence';
import RotateAlign from './variants/RotateAlign';
import CatchOrb from './variants/CatchOrb';

function App() {
  return (
    <div className="app-container">
      <div className="header">
        <ShieldCheck size={48} color="#3b82f6" style={{ margin: '0 auto 1rem' }} />
        <h1>Красивая защита от ботов</h1>
        <p>Выберите любой из вариантов проверки на человечность.</p>
      </div>

      <div className="grid">
        <div className="card">
          <div className="card-title">Удержание</div>
          <HoldToVerify />
        </div>
        
        <div className="card">
          <div className="card-title">Слайдер-пазл</div>
          <SliderPuzzle />
        </div>

        <div className="card">
          <div className="card-title">Порядок иконок</div>
          <OrderSequence />
        </div>

        <div className="card">
          <div className="card-title">Вращение</div>
          <RotateAlign />
        </div>

        <div className="card">
          <div className="card-title">Поймать сферу</div>
          <CatchOrb />
        </div>
      </div>
    </div>
  );
}

export default App;
