import { Router } from 'express';
import { User, VerificationCode, FinancialGoal } from '../models/index.js';
import { authenticate } from '../middleware/auth.js';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();
const router = Router();

const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const sendVerificationEmail = async (email, name, code) => {

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'planejadordegastosdasgalaxias@gmail.com',
        pass: 'vzuwyhqfusbbzsps',
      },
    });

  const msg = {
    to: email,
    from: '"Planejador Das Galáxias" <planejadordegastosdasgalaxias@gmail.com>',
    subject: 'Código de Verificação - Planejador Das Galáxias',
    text: `Seu código de verificação é: ${code}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Código de Verificação</h2>
        <p>Olá ${name || 'Usuário'},</p>
        <p>Seu código de verificação é:</p>
        <div style="background-color: #f4f4f4; padding: 20px; text-align: center; font-size: 24px; font-weight: bold; margin: 20px 0;">
          ${code}
        </div>
        <p>Este código expira em 10 minutos.</p>
        <p>Se você não solicitou este código, ignore este email.</p>
      </div>
    `,
  };
  try {
      await transporter.sendMail(msg);
    console.log(`Email enviado com sucesso para: ${email}`);
  } catch (error) {
    console.error(`Erro ao enviar email para ${email}:`, error);
    throw new Error('Falha ao enviar email de verificação');
  }
};

// Rota para listar todos os usuários
router.get('/', authenticate, async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: ['id', 'name', 'email', 'created_at', 'updated_at']
    });
    res.json(users);
  } catch (error) {
    console.error('Erro ao listar usuários:', error);
    res.status(500).json({ message: 'Erro ao listar usuários' });
  }
});

// Route to get user details
router.get('/:id', authenticate, async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({
      id: user.id,
      name: user.name,
      email: user.getDecryptedEmail(), // Decrypt email before sending
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ message: 'Error fetching user' });
  }
});

// Rota para buscar perfil do usuário logado
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = req.user;
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      financial_goal_name: user.financial_goal_name,
      financial_goal_amount: user.financial_goal_amount,
      financial_goal_start_date: user.financial_goal_start_date,
      financial_goal_end_date: user.financial_goal_end_date
    });
  } catch (error) {
    console.error('Erro ao buscar usuário:', error);
    res.status(500).json({ message: 'Erro ao buscar usuário' });
  }
});

// Rota para atualizar perfil do usuário logado
router.put('/me', authenticate, async (req, res) => {
  try {
    const user = req.user;
    const { 
      name, 
      financial_goal_name, 
      financial_goal_amount, 
      financialGoalPeriodType,
      financialGoalPeriodValue 
    } = req.body;

    // Validações
    if (!name) {
      return res.status(400).json({ message: 'Nome é obrigatório' });
    }

    // Calcula as datas do objetivo financeiro
    let startDate = null;
    let endDate = null;
    
    if (financialGoalPeriodType && financialGoalPeriodValue) {
      startDate = new Date();
      endDate = new Date(startDate);

      switch (financialGoalPeriodType) {
        case 'days':
          endDate.setDate(startDate.getDate() + parseInt(financialGoalPeriodValue));
          break;
        case 'months':
          endDate.setMonth(startDate.getMonth() + parseInt(financialGoalPeriodValue));
          break;
        case 'years':
          endDate.setFullYear(startDate.getFullYear() + parseInt(financialGoalPeriodValue));
          break;
      }
    }

    // Atualiza os dados do usuário
    const updatedUser = await user.update({
      name,
      financial_goal_name: financial_goal_name || null,
      financial_goal_amount: financial_goal_amount || null,
      financial_goal_start_date: startDate,
      financial_goal_end_date: endDate
    });

    // Retorna os dados atualizados
    res.json({
      id: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email,
      financial_goal_name: updatedUser.financial_goal_name,
      financial_goal_amount: updatedUser.financial_goal_amount,
      financial_goal_start_date: updatedUser.financial_goal_start_date,
      financial_goal_end_date: updatedUser.financial_goal_end_date
    });
  } catch (error) {
    console.error('Erro ao atualizar usuário:', error);
    res.status(500).json({ message: 'Erro ao atualizar usuário' });
  }
});

// Rota para atualizar objetivo financeiro do usuário logado
router.put('/financial-goal', authenticate, async (req, res) => {
  try {
    const { name, amount, time } = req.body;
    const user = await User.findByPk(req.user.id);

    if (!user) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    // Validações
    if (!name || !amount || !time) {
      return res.status(400).json({ message: 'Todos os campos do objetivo financeiro são obrigatórios.' });
    }

    // Converte os valores para o formato correto
    const parsedAmount = parseFloat(amount.toString().replace(/\./g, '').replace(',', '.'));
    if (isNaN(parsedAmount)) {
      return res.status(400).json({ message: 'Valor do objetivo financeiro inválido.' });
    }

    // Se não tinha objetivo antes ou a data de criação é inválida, define a data atual
    if ((!user.financial_goal_amount && parsedAmount) || 
        (parsedAmount && (!user.financial_goal_created_at || isNaN(new Date(user.financial_goal_created_at).getTime())))) {
      user.financial_goal_created_at = new Date();
    }

    // Atualiza os dados do objetivo
    const updatedUser = await user.update({
      financial_goal_name: name,
      financial_goal_amount: parsedAmount,
      financial_goal_time: time
    });

    console.log('Objetivo financeiro atualizado:', {
      name: updatedUser.financial_goal_name,
      amount: updatedUser.financial_goal_amount,
      time: updatedUser.financial_goal_time,
      created_at: updatedUser.financial_goal_created_at
    });

    res.json({
      message: 'Objetivo financeiro atualizado com sucesso',
      financial_goal: {
        name: updatedUser.financial_goal_name,
        amount: updatedUser.financial_goal_amount,
        time: updatedUser.financial_goal_time,
        created_at: updatedUser.financial_goal_created_at
      }
    });
  } catch (error) {
    console.error('Erro ao atualizar objetivo financeiro:', error);
    res.status(500).json({ message: 'Erro ao atualizar objetivo financeiro' });
  }
});

// Rota para atualizar o valor atual da meta financeira
router.put('/financial-goal/current-amount', authenticate, async (req, res) => {
  try {
    const { current_amount } = req.body;
    
    // Busca a meta financeira do usuário
    const financialGoal = await FinancialGoal.findOne({
      where: { user_id: req.user.id }
    });

    if (!financialGoal) {
      return res.status(404).json({ message: 'Meta financeira não encontrada' });
    }

    // Converte o valor para o formato correto
    const parsedAmount = parseFloat(current_amount.toString().replace(/\./g, '').replace(',', '.'));
    if (isNaN(parsedAmount)) {
      return res.status(400).json({ message: 'Valor inválido' });
    }

    // Atualiza o valor atual
    await financialGoal.update({
      current_amount: parsedAmount
    });

    res.json({
      message: 'Valor atual da meta atualizado com sucesso',
      current_amount: parsedAmount
    });
  } catch (error) {
    console.error('Erro ao atualizar valor atual da meta:', error);
    res.status(500).json({ message: 'Erro ao atualizar valor atual da meta' });
  }
});

// Rota para iniciar processo de mudança de email
router.post('/change-email/request', authenticate, async (req, res) => {
  try {
    const { current_email, new_email } = req.body;
    const user = await User.findByPk(req.user.id);

    if (!user) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    if (user.email !== current_email) {
      return res.status(400).json({ message: 'Email atual incorreto' });
    }

    if (!/^\S+@\S+\.\S+$/.test(new_email)) {
      return res.status(400).json({ message: 'Novo email inválido' });
    }

    // Verifica se o novo email já está em uso
    const existingUser = await User.findOne({ where: { email: new_email } });
    if (existingUser) {
      return res.status(400).json({ message: 'Este email já está em uso' });
    }

    // Gera e salva o código de verificação
    const code = generateVerificationCode();
    await VerificationCode.destroy({ where: { email: new_email } });
    await VerificationCode.create({
      email: new_email,
      code,
      expires_at: new Date(Date.now() + 10 * 60 * 1000)
    });

    // Envia o código para o novo email
    await sendVerificationEmail(new_email, user.name, code);

    res.json({ message: 'Código de verificação enviado para o novo email' });
  } catch (error) {
    console.error('Erro ao iniciar mudança de email:', error);
    res.status(500).json({ message: 'Erro ao processar solicitação' });
  }
});

// Rota para verificar código e completar mudança de email
router.post('/change-email/verify', authenticate, async (req, res) => {
  try {
    const { new_email, code } = req.body;
    const user = await User.findByPk(req.user.id);

    if (!user) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    // Verifica o código
    const verification = await VerificationCode.findOne({
      where: {
        email: new_email,
        code
      }
    });

    if (!verification || Date.now() > verification.expires_at) {
      return res.status(400).json({ message: 'Código inválido ou expirado' });
    }

    // Atualiza o email do usuário
    await user.update({ email: new_email });
    await VerificationCode.destroy({ where: { email: new_email } });

    res.json({
      message: 'Email atualizado com sucesso',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        financial_goal_name: user.financial_goal_name,
        financial_goal_amount: user.financial_goal_amount,
        financial_goal_start_date: user.financial_goal_start_date,
        financial_goal_end_date: user.financial_goal_end_date
      }
    });
  } catch (error) {
    console.error('Erro ao verificar código:', error);
    res.status(500).json({ message: 'Erro ao verificar código' });
  }
});

// Route to create a new user
router.post('/create', async (req, res) => {
  try {
    const { name, email, ...otherData } = req.body;
    const newUser = await User.create({
      name,
      email, // Will be encrypted by the model hook
      ...otherData
    });
    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.getDecryptedEmail(), // Decrypt email before sending
      }
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ message: 'Error creating user' });
  }
});

export default router;