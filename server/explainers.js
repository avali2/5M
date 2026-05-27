export const explainers = {
  ivRank: {
    title: 'IV Rank',
    simple: 'Indica si la volatilidad implicita actual esta alta o baja frente a sus propias observaciones historicas.',
    institutional: 'Valido 1M no fabrica IV Rank desde volatilidad historica del precio. Lo calcula solo despues de guardar suficientes snapshots reales de IV; hasta entonces bloquea setups que dependan de vender prima cara.'
  },
  gammaExposure: {
    title: 'Gamma Exposure',
    simple: 'Gamma muestra cuanto cambia el delta cuando se mueve el precio.',
    institutional: 'El sistema calcula un proxy ponderado por open interest y gamma reportada en la chain. Esto mide riesgo de convexidad visible, pero no confirma la posicion neta de dealers sin un feed licenciado.'
  },
  theta: {
    title: 'Theta Decay',
    simple: 'Es el valor que una opcion pierde con el paso del tiempo, si lo demas permanece igual.',
    institutional: 'Los spreads de credito se favorecen de theta positivo, pero Valido 1M exige riesgo definido, liquidez y ausencia de catalizadores binarios antes de considerarlo ventaja.'
  },
  expectedMove: {
    title: 'Expected Move',
    simple: 'Es el rango que las opciones implican hasta vencimiento.',
    institutional: 'El motor lo obtiene desde IV real de la cadena y DTE. Sirve para ubicar strikes, no como garantia de que el precio quedara dentro del rango.'
  },
  vega: {
    title: 'Vega Risk',
    simple: 'Vega mide la sensibilidad del precio de la opcion a cambios en volatilidad implicita.',
    institutional: 'Al vender prima existe riesgo de expansion de IV. Por eso el motor bloquea eventos macro, earnings y titulares de choque antes de favorecer theta.'
  },
  liquidity: {
    title: 'Liquidity Score',
    simple: 'Evalua si puedes entrar y salir con poco costo.',
    institutional: 'Se basa en bid/ask, volumen y open interest reales de las patas. Un spread teoricamente bueno se descarta si el slippage puede comerse la ventaja.'
  }
};
