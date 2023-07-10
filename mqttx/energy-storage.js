// 设计的容量 (kWh)
const designCapacity = 2800;
const store = {
  index: 0
}

function transformToFloat(val) {
  if (typeof val !== 'number') {
    val = Number(val)
  }
  const _val = val.toFixed(2)
  if (_val.endsWith('.00')) {
    return parseFloat(_val) + 0.01
  }
  return parseFloat(_val)
}

function generator(faker, options) {
  const clientid = options.clientid
  function getRandom(c = 10) {
    return faker.datatype.float({ min: -1 * c, max: 1 * c });
  }

  function getInputOutputPowerAndCapacity(timestamp) {
    // 初始值
    // 08:00 - 18:00 输入在 300 - 600 之间, 18:00 - 23:00 输入在 0 - 200 之间, 23:00 - 08:00 输入在 700 - 1250 之间
    // 08:00 - 18:00 输出在 625 - 800 之间, 18:00 - 23:00 输出在 625 - 1250 之间, 23:00 - 08:00 输出在 0 - 100 之间
    // 08:00 - 18:00 储能量在 60%-90% 之间, 18:00 - 23:00 储能容量在 10%-30% 之间, 23:00 - 08:00 储能容量在 10%-80% 之间

    // 变化值
    // 08:00 - 18:00 输入在 0 - 300 之间, 18:00 - 23:00 输入在 0 - 200 之间, 23:00 - 08:00 输入在 0 - 550 之间
    // 08:00 - 18:00 输出在 0 - 175 之间, 18:00 - 23:00 输出在 0 - 625 之间, 23:00 - 08:00 输出在 0 - 100 之间
    const hour = new Date(timestamp).getHours();
    let inputPower = 0;
    let outputPower = 0;
    let initialPercentage = 0;
    if (hour >= 8 && hour < 18) {
      inputPower = faker.helpers.arrayElement([300, 380, 400, 625, 800]);
      outputPower = faker.helpers.arrayElement([625, 800]);
      initialPercentage = faker.helpers.arrayElement([60, 70, 80, 90]);
    }
    if (hour >= 18 && hour < 23) {
      inputPower = faker.helpers.arrayElement([0, 100, 200, 625, 800]);
      outputPower = faker.helpers.arrayElement([625, 800, 1250]);
      initialPercentage = faker.helpers.arrayElement([10, 20, 30]);
    }
    if (hour >= 23 || hour < 8) {
      inputPower = faker.helpers.arrayElement([700, 800, 1250]);
      outputPower = faker.helpers.arrayElement([0, 100]);
      initialPercentage = faker.helpers.arrayElement([30, 40, 50, 60, 70, 80]);
    }
    return { inputPower, outputPower, initialPercentage: initialPercentage / 100 };
  }

  function powerToTemperature(power, temperatureOffset) {
    // 初始温度，与总功率有关
    // 2500kW = 55℃, 0kW = 20℃
    const temperature = 20 + power / 2500 * 0.014 + temperatureOffset + getRandom(1.1)
    return temperature
  }

  function capacityToVoltage(percentage) {
    // 初始电压，与容量有关
    // 100% = 1231.2V, 0% = 957.6V
    const voltage = 957.6 + percentage * 2.73;
    return voltage
  }


  if (!store[clientid]) {
    // 当前剩余电量百分比
    const startTimestamp = Date.now() - 24 * 60 * 60 * 1000
    const { inputPower, outputPower, initialPercentage } = getInputOutputPowerAndCapacity(startTimestamp)
    const remainingCapacity = designCapacity * initialPercentage
    const temperatureOffset = faker.datatype.float({ min: -5, max: 10 })

    store[clientid] = {
      id: faker.datatype.uuid(),
      name: `Energy_Storage_${store.index++}`,
      type: 'FX48-B2800',
      inputPower,
      outputPower,
      percentage: initialPercentage,
      remainingCapacity,
      timestamp: startTimestamp,
      // 温度偏移量
      temperatureOffset,
      temperature: 0,
      voltage: 0,
      battery: [
        {
          id: faker.datatype.uuid(),
          name: 'Battery_1',
          voltage: 0,
          temperature: 0,
          percentage: initialPercentage + getRandom(0.001),
        },
        {
          id: faker.datatype.uuid(),
          name: 'Battery_2',
          voltage: 0,
          temperature: 0,
          percentage: initialPercentage + getRandom(0.001),
        },
        {
          id: faker.datatype.uuid(),
          name: 'Battery_3',
          voltage: 0,
          temperature: 0,
          percentage: initialPercentage + getRandom(0.001),
        },
      ],
    }
  }

  const data = store[clientid]

  // 计算系统状态
  // 输入输出功率根据时段变化而切换 在 08:00, 18:00, 23:00 时切换
  let { inputPower, outputPower, timestamp, percentage, remainingCapacity } = store[clientid]
  if ([8, 18, 23].includes(new Date(timestamp).getHours())) {
    const p = getInputOutputPowerAndCapacity(timestamp)
    inputPower = p.inputPower
    outputPower = p.outputPower
  } else {
    inputPower += getRandom();
    outputPower += getRandom();
  }
  if (outputPower !== 0 && percentage < 0 || remainingCapacity < 0) {
    outputPower = 0
    remainingCapacity = 0
    percentage = 0
  }
  if (inputPower !== 0 && percentage > 100 || remainingCapacity > designCapacity) {
    inputPower = 0
    remainingCapacity = designCapacity
    percentage = 100
  }

  if (percentage <= 90 && inputPower === 0) {
    inputPower = getInputOutputPowerAndCapacity(timestamp).inputPower
  } else if (percentage >= 10 && outputPower === 0) {
    outputPower = getInputOutputPowerAndCapacity(timestamp).outputPower
  }


  // 计算 10 秒数内 remainingCapacity 的变化
  const deltaCapacity = (inputPower - outputPower) / 3600 * 10;
  data.deltaCapacity = deltaCapacity;
  data.remainingCapacity = remainingCapacity + deltaCapacity;
  data.percentage = remainingCapacity / designCapacity * 100;

  // 更新信息
  data.inputPower = inputPower;
  data.outputPower = outputPower;
  data.timestamp += 10 * 1000;


  // 3 组电池包的状态, 功率随机分配到 3 组电池包
  const batteryInputPower = data.inputPower / 3;
  const batteryOutputPower = data.outputPower / 3;
  data.battery.forEach(battery => {
    battery.percentage = data.percentage + getRandom(0.01);
    if (battery.percentage > 100) {
      battery.percentage = 100;
    } else if (battery.percentage < 0) {
      battery.percentage = 0;
    }
    battery.voltage = capacityToVoltage(battery.percentage);
    battery.temperature = powerToTemperature(batteryInputPower + batteryOutputPower, data.temperatureOffset);
    battery.inputPower = batteryInputPower;
    battery.outputPower = batteryOutputPower;

    battery.percentage = transformToFloat(battery.percentage);
    battery.voltage = transformToFloat(battery.voltage);
    battery.temperature = transformToFloat(battery.temperature);
    battery.inputPower = transformToFloat(battery.inputPower);
    battery.outputPower = transformToFloat(battery.outputPower);

  })
  // 总温度与电压等于电池平均值
  data.temperature = data.battery.reduce((sum, battery) => sum + battery.temperature, 0) / 3;
  data.voltage = data.battery.reduce((sum, battery) => sum + battery.voltage, 0) / 3;

  data.temperature = transformToFloat(data.temperature);
  data.voltage = transformToFloat(data.voltage);
  data.percentage = transformToFloat(data.percentage);
  data.remainingCapacity = transformToFloat(data.remainingCapacity);
  data.deltaCapacity = transformToFloat(data.deltaCapacity);
  data.inputPower = transformToFloat(data.inputPower);
  data.outputPower = transformToFloat(data.outputPower);

  const message = { ...data }
  delete message.lastTimestamp
  delete message.temperatureOffset
  return {
    message: JSON.stringify(message),
  }
}


const name = 'Energy-Storage'
const author = 'EMQX Team'
const dataFormat = 'JSON'
const version = '0.0.1'
const description = `Energy Storage Simulator, mock data start from 24 hours ago.
Each execution time will be increased by 10 seconds.`

module.exports = {
  generator,
  name,
  author,
  dataFormat,
  version,
  description,
}
